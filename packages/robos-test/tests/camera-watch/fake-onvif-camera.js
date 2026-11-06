'use strict';

// A pretend ONVIF camera for tests: answers the SOAP calls Camera Watch makes
// (date/time, capabilities, profiles, video sources, device info, stream and
// snapshot URIs, PTZ moves and presets) over HTTP on 127.0.0.1. It checks the
// WS-Security user name on every call except GetSystemDateAndTime, like real
// cameras do, and records the PTZ requests it gets.

const http = require('node:http');

const NS = 'xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" '
  + 'xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema" '
  + 'xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"';

const envelope = (body) => `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope ${NS}><SOAP-ENV:Body>${body}</SOAP-ENV:Body></SOAP-ENV:Envelope>`;

const fault = (reason) => envelope(
  `<SOAP-ENV:Fault><SOAP-ENV:Code><SOAP-ENV:Value>SOAP-ENV:Sender</SOAP-ENV:Value></SOAP-ENV:Code><SOAP-ENV:Reason><SOAP-ENV:Text xml:lang="en">${reason}</SOAP-ENV:Text></SOAP-ENV:Reason></SOAP-ENV:Fault>`,
);

function profileXml(token, name, w, h) {
  return `<trt:Profiles token="${token}" fixed="true"><tt:Name>${name}</tt:Name>`
    + '<tt:VideoSourceConfiguration token="vsc1"><tt:Name>vsc1</tt:Name><tt:UseCount>2</tt:UseCount><tt:SourceToken>vs1</tt:SourceToken><tt:Bounds x="0" y="0" width="1920" height="1080"/></tt:VideoSourceConfiguration>'
    + `<tt:VideoEncoderConfiguration token="vec-${token}"><tt:Name>enc</tt:Name><tt:UseCount>1</tt:UseCount><tt:Encoding>H264</tt:Encoding><tt:Resolution><tt:Width>${w}</tt:Width><tt:Height>${h}</tt:Height></tt:Resolution><tt:Quality>5</tt:Quality><tt:RateControl><tt:FrameRateLimit>15</tt:FrameRateLimit><tt:EncodingInterval>1</tt:EncodingInterval><tt:BitrateLimit>2048</tt:BitrateLimit></tt:RateControl></tt:VideoEncoderConfiguration>`
    + '<tt:PTZConfiguration token="ptz1"><tt:Name>ptz</tt:Name><tt:UseCount>2</tt:UseCount><tt:NodeToken>node1</tt:NodeToken></tt:PTZConfiguration>'
    + '</trt:Profiles>';
}

function startFakeOnvifCamera({ username = 'admin', password = 'secret', ptz = true } = {}) {
  const calls = [];
  let base = '';

  const handlers = {
    GetSystemDateAndTime: () => {
      const d = new Date();
      return '<tds:GetSystemDateAndTimeResponse><tds:SystemDateAndTime><tt:DateTimeType>NTP</tt:DateTimeType><tt:DaylightSavings>false</tt:DaylightSavings>'
        + `<tt:UTCDateTime><tt:Time><tt:Hour>${d.getUTCHours()}</tt:Hour><tt:Minute>${d.getUTCMinutes()}</tt:Minute><tt:Second>${d.getUTCSeconds()}</tt:Second></tt:Time>`
        + `<tt:Date><tt:Year>${d.getUTCFullYear()}</tt:Year><tt:Month>${d.getUTCMonth() + 1}</tt:Month><tt:Day>${d.getUTCDate()}</tt:Day></tt:Date></tt:UTCDateTime>`
        + '</tds:SystemDateAndTime></tds:GetSystemDateAndTimeResponse>';
    },
    // Older cameras do not have GetServices; the library falls back to GetCapabilities.
    GetServices: () => null,
    GetCapabilities: () => '<tds:GetCapabilitiesResponse><tds:Capabilities>'
      + `<tt:Device><tt:XAddr>${base}/onvif/device_service</tt:XAddr></tt:Device>`
      + `<tt:Events><tt:XAddr>${base}/onvif/events</tt:XAddr><tt:WSSubscriptionPolicySupport>false</tt:WSSubscriptionPolicySupport><tt:WSPullPointSupport>true</tt:WSPullPointSupport><tt:WSPausableSubscriptionManagerInterfaceSupport>false</tt:WSPausableSubscriptionManagerInterfaceSupport></tt:Events>`
      + `<tt:Media><tt:XAddr>${base}/onvif/media</tt:XAddr></tt:Media>`
      + (ptz ? `<tt:PTZ><tt:XAddr>${base}/onvif/ptz</tt:XAddr></tt:PTZ>` : '')
      + '</tds:Capabilities></tds:GetCapabilitiesResponse>',
    GetProfiles: () => `<trt:GetProfilesResponse>${profileXml('main', 'MainStream', 1920, 1080)}${profileXml('sub', 'SubStream', 640, 360)}</trt:GetProfilesResponse>`,
    GetVideoSources: () => '<trt:GetVideoSourcesResponse><trt:VideoSources token="vs1"><tt:Framerate>15</tt:Framerate><tt:Resolution><tt:Width>1920</tt:Width><tt:Height>1080</tt:Height></tt:Resolution></trt:VideoSources></trt:GetVideoSourcesResponse>',
    GetDeviceInformation: () => '<tds:GetDeviceInformationResponse><tds:Manufacturer>Acme</tds:Manufacturer><tds:Model>Cam-9000</tds:Model><tds:FirmwareVersion>1.2.3</tds:FirmwareVersion><tds:SerialNumber>SN123</tds:SerialNumber><tds:HardwareId>HW1</tds:HardwareId></tds:GetDeviceInformationResponse>',
    GetStreamUri: (body) => {
      const token = /ProfileToken>([^<]+)</.exec(body)?.[1] || 'main';
      return `<trt:GetStreamUriResponse><trt:MediaUri><tt:Uri>rtsp://127.0.0.1:554/${token}</tt:Uri><tt:InvalidAfterConnect>false</tt:InvalidAfterConnect><tt:InvalidAfterReboot>false</tt:InvalidAfterReboot><tt:Timeout>PT0S</tt:Timeout></trt:MediaUri></trt:GetStreamUriResponse>`;
    },
    GetSnapshotUri: () => `<trt:GetSnapshotUriResponse><trt:MediaUri><tt:Uri>${base}/snapshot.jpg</tt:Uri><tt:InvalidAfterConnect>false</tt:InvalidAfterConnect><tt:InvalidAfterReboot>false</tt:InvalidAfterReboot><tt:Timeout>PT0S</tt:Timeout></trt:MediaUri></trt:GetSnapshotUriResponse>`,
    ContinuousMove: () => '<tptz:ContinuousMoveResponse/>',
    Stop: () => '<tptz:StopResponse/>',
    GetPresets: () => '<tptz:GetPresetsResponse>'
      + '<tptz:Preset token="1"><tt:Name>Gate</tt:Name></tptz:Preset>'
      + '<tptz:Preset token="2"><tt:Name>Street</tt:Name></tptz:Preset>'
      + '</tptz:GetPresetsResponse>',
    GotoPreset: () => '<tptz:GotoPresetResponse/>',
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const action = Object.keys(handlers).find((a) => new RegExp(`<(\\w+:)?${a}[\\s/>]`).test(body));
      calls.push({ action: action || 'unknown', body, path: req.url });
      const send = (status, xml) => {
        res.writeHead(status, { 'Content-Type': 'application/soap+xml; charset=utf-8' });
        res.end(xml);
      };
      if (!action) { send(400, fault('Unknown action')); return; }
      if (action !== 'GetSystemDateAndTime') {
        const user = /Username[^>]*>([^<]+)</.exec(body)?.[1];
        if (user !== username) { send(400, fault('Sender not Authorized')); return; }
      }
      const out = handlers[action](body);
      if (out === null) { send(400, fault('Optional Action Not Implemented')); return; }
      send(200, envelope(out));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      base = `http://127.0.0.1:${port}`;
      resolve({
        port,
        base,
        password,
        calls,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

module.exports = { startFakeOnvifCamera };
