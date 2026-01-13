import { useMsal } from "@azure/msal-react";
import { loginRequest } from "@/config/authConfig";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

export const LoginPage = () => {
  const { instance } = useMsal();

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch((error) => {
      console.error("Login failed:", error);
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            CCoE Operations Assistant
          </h1>
          <p className="text-muted-foreground">
            Sign in with your organization account to continue
          </p>
        </div>
        
        <Button 
          onClick={handleLogin} 
          size="lg"
          className="gap-2"
        >
          <LogIn className="h-5 w-5" />
          Sign in with Microsoft
        </Button>
      </div>
    </div>
  );
};
