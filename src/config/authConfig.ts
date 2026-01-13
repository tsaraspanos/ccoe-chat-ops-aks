import { Configuration, LogLevel } from "@azure/msal-browser";

// Helper to get runtime config (from window.__RUNTIME_CONFIG__ or env vars)
const getRuntimeConfig = (key: string, fallback: string = ""): string => {
  // Check for runtime config injected by server (for Docker/K8s deployments)
  if (typeof window !== "undefined" && (window as any).__RUNTIME_CONFIG__?.[key]) {
    return (window as any).__RUNTIME_CONFIG__[key];
  }
  // Fall back to build-time env vars (for local development)
  return import.meta.env[`VITE_${key}`] || fallback;
};

// MSAL configuration for Microsoft Entra ID
export const msalConfig: Configuration = {
  auth: {
    clientId: getRuntimeConfig("AZURE_CLIENT_ID"),
    authority: `https://login.microsoftonline.com/${getRuntimeConfig("AZURE_TENANT_ID", "common")}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            break;
          case LogLevel.Warning:
            console.warn(message);
            break;
          case LogLevel.Info:
            console.info(message);
            break;
          case LogLevel.Verbose:
            console.debug(message);
            break;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Scopes for the access token
export const loginRequest = {
  scopes: ["User.Read", "openid", "profile", "email"],
};
