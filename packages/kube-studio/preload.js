const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getClusters: () => ipcRenderer.invoke("kube-get-clusters"),
  getNamespaces: (opts) => ipcRenderer.invoke("kube-get-namespaces", opts),
  getResources: (opts) => ipcRenderer.invoke("kube-get-resources", opts),
  getResourceYaml: (opts) => ipcRenderer.invoke("kube-get-resource-yaml", opts),
  getPodLogs: (opts) => ipcRenderer.invoke("kube-get-pod-logs", opts),
  rolloutRestart: (opts) => ipcRenderer.invoke("kube-rollout-restart", opts),
  scaleDeployment: (opts) => ipcRenderer.invoke("kube-scale-deployment", opts),
  getHelmReleases: (opts) => ipcRenderer.invoke("kube-get-helm-releases", opts),
  getArgoCDApps: (opts) => ipcRenderer.invoke("kube-get-argocd-apps", opts),
  syncArgoCDApp: (opts) => ipcRenderer.invoke("kube-sync-argocd-app", opts),
  getVercelDeployments: (opts) => ipcRenderer.invoke("kube-get-vercel-deployments", opts),
  askKubeAI: (opts) => ipcRenderer.invoke("kube-ask-ai", opts),
});
