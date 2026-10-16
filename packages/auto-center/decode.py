import json, sys, urllib.request
from urllib.parse import urlencode, quote
vin, year = sys.argv[1:]
url = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + quote(vin,safe='') + '?' + urlencode({'format':'json','modelyear':year})
with urllib.request.urlopen(url,timeout=45) as response:
 print(json.dumps(json.load(response)))
