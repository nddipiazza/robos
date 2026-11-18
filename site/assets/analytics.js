(function () {
  // Public site token from Cloudflare Web Analytics > rowbose.com > Manage site.
  var token = '7a002051504a4f63b18b9eabc7d28bbb';
  if (!token || !/^(www\.)?rowbose\.com$/.test(window.location.hostname)) return;

  var beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: token }));
  document.body.appendChild(beacon);
})();
