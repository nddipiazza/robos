(function () {
  var dark = document.documentElement.dataset.theme === 'dark';
  var light = {
    primaryColor: '#e8ecf6', primaryTextColor: '#1c2c6e', primaryBorderColor: '#1c2c6e',
    lineColor: '#5a6070', secondaryColor: '#f2ead3', tertiaryColor: '#fffdf8',
    mainBkg: '#e8ecf6', nodeBorder: '#1c2c6e', clusterBkg: '#f7f5ef', clusterBorder: '#d9d4c5',
    edgeLabelBackground: '#f7f5ef', noteBkgColor: '#f2ead3', noteBorderColor: '#c2410c', noteTextColor: '#262a33',
    actorBkg: '#e8ecf6', actorBorder: '#1c2c6e', actorTextColor: '#1c2c6e', signalColor: '#5a6070', signalTextColor: '#262a33'
  };
  var night = {
    darkMode: true, primaryColor: '#131a2b', primaryTextColor: '#e8ebf5', primaryBorderColor: '#9db4ff',
    lineColor: '#97a1b8', secondaryColor: '#161b2a', tertiaryColor: '#0d111c',
    mainBkg: '#131a2b', nodeBorder: '#9db4ff', clusterBkg: '#0d111c', clusterBorder: '#25304a',
    edgeLabelBackground: '#0d111c', noteBkgColor: '#161b2a', noteBorderColor: '#ff9a6c', noteTextColor: '#e8ebf5',
    actorBkg: '#131a2b', actorBorder: '#9db4ff', actorTextColor: '#e8ebf5', signalColor: '#97a1b8', signalTextColor: '#d3d8e6'
  };
  var vars = dark ? night : light;
  vars.background = 'transparent';
  vars.fontFamily = 'Plus Jakarta Sans, system-ui, sans-serif';
  var natural = { useMaxWidth: false };
  return { startOnLoad: false, theme: 'base', securityLevel: 'loose', themeVariables: vars,
    flowchart: natural, sequence: natural, journey: natural, gantt: natural, state: natural,
    class: natural, er: natural, timeline: natural, mindmap: natural, requirement: natural };
})()