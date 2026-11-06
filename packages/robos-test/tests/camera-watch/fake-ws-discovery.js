'use strict';

// A pretend ONVIF camera that answers WS-Discovery probes: it joins the
// 239.255.255.250:3702 multicast group and replies to each Probe with a
// ProbeMatch, like a camera on the LAN. Resolves to null when this machine
// cannot bind the port or join the group (some CI sandboxes).

const dgram = require('node:dgram');

function probeMatch({ relatesTo, urn, xaddr, name, hardware }) {
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" '
    + 'xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">'
    + '<SOAP-ENV:Header><wsa:MessageID>urn:uuid:11111111-2222-3333-4444-555555555555</wsa:MessageID>'
    + `<wsa:RelatesTo>${relatesTo}</wsa:RelatesTo>`
    + '<wsa:To>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:To>'
    + '<wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/ProbeMatches</wsa:Action></SOAP-ENV:Header>'
    + '<SOAP-ENV:Body><d:ProbeMatches><d:ProbeMatch>'
    + `<wsa:EndpointReference><wsa:Address>${urn}</wsa:Address></wsa:EndpointReference>`
    + '<d:Types>dn:NetworkVideoTransmitter</d:Types>'
    + `<d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/name/${encodeURIComponent(name)} onvif://www.onvif.org/hardware/${encodeURIComponent(hardware)} onvif://www.onvif.org/location/</d:Scopes>`
    + `<d:XAddrs>${xaddr}</d:XAddrs><d:MetadataVersion>1</d:MetadataVersion>`
    + '</d:ProbeMatch></d:ProbeMatches></SOAP-ENV:Body></SOAP-ENV:Envelope>';
}

function startFakeDiscoveryResponder({ xaddr, name = 'Front_Door', hardware = 'Cam-9000', urn = 'urn:uuid:fake-camera-0001' }) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let probes = 0;
    sock.on('error', () => { try { sock.close(); } catch {} resolve(null); });
    sock.on('message', (msg, rinfo) => {
      const text = msg.toString();
      if (!/Probe[\s>]/.test(text) || /ProbeMatches/.test(text)) return;
      probes++;
      const relatesTo = /MessageID[^>]*>([^<]+)</.exec(text)?.[1] || '';
      const reply = Buffer.from(probeMatch({ relatesTo, urn, xaddr, name, hardware }));
      sock.send(reply, rinfo.port, rinfo.address);
    });
    sock.bind(3702, () => {
      try {
        sock.addMembership('239.255.255.250');
        sock.setMulticastLoopback(true);
      } catch {
        try { sock.close(); } catch {}
        resolve(null);
        return;
      }
      resolve({
        get probes() { return probes; },
        close: () => new Promise((r) => sock.close(() => r())),
      });
    });
  });
}

module.exports = { startFakeDiscoveryResponder };
