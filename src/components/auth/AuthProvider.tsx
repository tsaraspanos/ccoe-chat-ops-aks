import { ReactNode, useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType, EventMessage, AuthenticationResult } from "@azure/msal-browser";
import { msalConfig } from "@/config/authConfig";

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeMsal = async () => {
      try {
        // Handle redirect promise FIRST - this is critical for page refresh/reload
        const response = await msalInstance.handleRedirectPromise();
        
        if (response) {
          // Set the account from the redirect response
          msalInstance.setActiveAccount(response.account);
        } else {
          // No redirect response, check for existing accounts
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
          }
        }

        // Add event callback for future login events
        msalInstance.addEventCallback((event: EventMessage) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const payload = event.payload as AuthenticationResult;
            msalInstance.setActiveAccount(payload.account);
          }
        });

        setIsInitialized(true);
      } catch (error) {
        console.error("MSAL initialization error:", error);
        // Still set initialized to show error state rather than infinite loading
        setIsInitialized(true);
      }
    };

    initializeMsal();
  }, []);

  // Show loading state while MSAL initializes
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
};
