#!/usr/bin/env python3
"""Cache official public automotive sources. No personal-record lookups."""
import argparse, ast, csv, hashlib, io, json, os, pathlib, time, urllib.request, zipfile

SOURCES = [
 ('diagnostics', 'https://raw.githubusercontent.com/brendan-w/python-OBD/master/obd/codes.py', 'python-OBD diagnostic trouble code descriptions (not repair instructions)', 'GPL-2.0-or-later; retain upstream copyright and license', 'diagnostics'),
 ('diagnostics-license', 'https://raw.githubusercontent.com/brendan-w/python-OBD/master/LICENSE', 'python-OBD license', 'GPL-2.0-or-later', 'document'),
 ('schemaorg', 'https://schema.org/version/latest/schemaorg-current-https.jsonld', 'Schema.org vocabulary', 'CC-BY-SA-3.0', 'vocabulary'),
 ('makes', 'https://vpic.nhtsa.dot.gov/api/vehicles/GetAllMakes?format=json', 'NHTSA vPIC all makes', 'US government public data', 'makes'),
 ('models', 'https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeId/0?format=json', 'NHTSA vPIC all models (no year association)', 'US government public data', 'models'),
 ('variables', 'https://vpic.nhtsa.dot.gov/api/vehicles/GetVehicleVariableList?format=json', 'NHTSA VIN variable dictionary', 'US government public data', 'variables'),
 ('epa', 'https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip', 'EPA fuel economy vehicle configurations, all available model years', 'US government public data', 'epa'),
 ('recalls-bulk', 'https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip', 'NHTSA bulk recall archive', 'US government public data', 'archive'),
 ('recalls-dictionary', 'https://static.nhtsa.gov/odi/ffdd/rcl/RCL.txt', 'NHTSA recall file dictionary', 'US government public data', 'document'),
 ('communications', 'https://www.nhtsa.gov/nhtsa-datasets-and-apis', 'NHTSA recalls, complaints, investigations and manufacturer communications API reference', 'US government public data', 'document'),
]

def collect(root, refresh=False, vehicle=None):
 root = pathlib.Path(root).expanduser(); root.mkdir(parents=True, exist_ok=True)
 manifest_file = root / 'manifest.json'
 old = json.loads(manifest_file.read_text()) if manifest_file.exists() else {'sources': []}
 entries = {e['id']: e for e in old['sources']}
 sources = list(SOURCES)
 if vehicle:
  year, make, model = vehicle
  from urllib.parse import urlencode
  query = urlencode({'make': make, 'model': model, 'modelYear': year})
  for kind in ['recalls','complaints']:
   key = kind + '-' + hashlib.sha256(query.encode()).hexdigest()[:12]
   sources.append((key, f'https://api.nhtsa.gov/{kind}/{kind}ByVehicle?{query}', f'NHTSA {year} {make} {model} {kind}; model-level, not VIN history', 'US government public data', kind))
 for key, url, title, license_, kind in sources:
  previous = entries.get(key)
  if previous and not refresh and (root / previous.get('file','missing')).is_file():
   print(f'cached {key}', flush=True); continue
  entry = dict(id=key, url=url, title=title, license=license_, kind=kind)
  try:
   data = None
   for attempt in range(3):
    try:
     request = urllib.request.Request(url, headers={'User-Agent':'RobOS-Auto/0.1 (public-data-import)'})
     with urllib.request.urlopen(request,timeout=120) as response:
      data = response.read(150 * 1024 * 1024 + 1)
      if len(data) > 150 * 1024 * 1024: raise ValueError('Source exceeds 150 MiB per-file limit')
      entry['contentType'] = response.headers.get('Content-Type')
     break
    except Exception:
     if attempt == 2: raise
     time.sleep(2 ** attempt)
   if kind in ['makes','models','variables','recalls','complaints','vocabulary']:
    doc = json.loads(data)
    if kind != 'vocabulary' and not isinstance(doc.get('Results',doc.get('results')),list): raise ValueError('Expected results array')
   digest = hashlib.sha256(data).hexdigest()
   suffix = '.zip' if kind in ['epa','archive'] else '.json' if kind not in ['document'] else '.txt'
   relative = f'raw/{key}/{digest}{suffix}'
   target = root / relative; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
   entry.update(file=relative,sha256=digest,bytes=len(data),retrievedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),status='downloaded')
   if kind == 'diagnostics':
    tree = ast.parse(data.decode('utf-8'))
    value = next(n.value for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'DTC' for t in n.targets))
    rows = [{'code': k, 'description': v} for k, v in ast.literal_eval(value).items()]
    parsed = root / 'derived' / f'{digest}.json'; parsed.parent.mkdir(exist_ok=True)
    parsed.write_text(json.dumps(rows)); entry.update(derived=str(parsed.relative_to(root)), records=len(rows), derivedSha256=hashlib.sha256(parsed.read_bytes()).hexdigest())
   if kind == 'epa':
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
     info = next(i for i in archive.infolist() if pathlib.PurePosixPath(i.filename).name == 'vehicles.csv')
     if info.file_size > 200 * 1024 * 1024: raise ValueError('Expanded EPA CSV too large')
     rows = list(csv.DictReader(io.StringIO(archive.read(info).decode('utf-8-sig'))))
    parsed = root / 'derived' / f'{digest}.json'; parsed.parent.mkdir(exist_ok=True)
    parsed.write_text(json.dumps(rows)); entry['derived'] = str(parsed.relative_to(root)); entry['records'] = len(rows); entry['derivedSha256'] = hashlib.sha256(parsed.read_bytes()).hexdigest()
   print(f'downloaded {key}: {len(data)} bytes',flush=True)
  except Exception as error:
   entry.update(status='failed', error=str(error))
   if previous and previous.get('status') == 'downloaded': entry['previous'] = previous
   print(f'FAILED {key}: {error}',flush=True)
  entries[key] = entry
  temporary = manifest_file.with_suffix('.tmp'); temporary.write_text(json.dumps({'sources': list(entries.values())},indent=2)); temporary.replace(manifest_file)
  time.sleep(0.5)
 return list(entries.values())

if __name__ == '__main__':
 parser = argparse.ArgumentParser(); parser.add_argument('--root', default='~/.robos/auto-scrape'); parser.add_argument('--refresh', action='store_true'); parser.add_argument('--vehicle',nargs=3,metavar=('YEAR','MAKE','MODEL'))
 args = parser.parse_args(); result = collect(args.root,args.refresh,args.vehicle)
 raise SystemExit(1 if any(e['status']=='failed' for e in result) else 0)
