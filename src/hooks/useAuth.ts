import { useMsal, useAccount } from "@azure/msal-react";
import { loginRequest } from "@/config/authConfig";

export const useAuth = () => {
  const { instance, accounts } = useMsal();
  const account = useAccount(accounts[0] || {});

  const logout = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (!account) return null;

    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      return response.accessToken;
    } catch (error) {
      console.error("Failed to acquire token silently:", error);
      // Fall back to interactive login (redirect doesn't return a response)
      try {
        await instance.acquireTokenRedirect(loginRequest);
        return null; // Will redirect, so this won't be reached
      } catch (interactiveError) {
        console.error("Interactive token acquisition failed:", interactiveError);
        return null;
      }
    }
  };

  return {
    user: account
      ? {
          id: account.localAccountId,
          name: account.name || "",
          email: account.username || "",
        }
      : null,
    isAuthenticated: !!account,
    logout,
    getAccessToken,
  };
};
