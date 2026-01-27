import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogOut, Save, UserCog, Cloud, CloudOff, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { useOneDrive } from "@/hooks/useOneDrive";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50, "First name too long"),
  middleName: z.string().trim().max(50, "Middle name too long").optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(50, "Last name too long"),
  email: z.string().trim().email("Invalid email address"),
  phone: z.string().trim().max(20, "Phone number too long").optional(),
});

export default function Profile() {
  const { user, isLoading, signOut } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [profileData, setProfileData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  
  const { 
    isConnected: isOneDriveConnected, 
    isLoading: isOneDriveLoading, 
    user: oneDriveUser, 
    connect: connectOneDrive, 
    disconnect: disconnectOneDrive 
  } = useOneDrive();

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, middle_name, last_name, email, phone")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setProfileData({
          firstName: data.first_name || "",
          middleName: data.middle_name || "",
          lastName: data.last_name || "",
          email: data.email || user.email || "",
          phone: data.phone || "",
        });
        return;
      }

      const nameParts = (user.user_metadata?.full_name || "").split(" ");
      setProfileData({
        firstName: nameParts[0] || "",
        middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "",
        lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : "",
        email: user.email || "",
        phone: "",
      });
    };

    loadProfile();
  }, [user]);

  const handleProfileChange = (field: string, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = profileSchema.safeParse(profileData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (!user) return;

    setIsSaving(true);
    try {
      const fullName = [profileData.firstName, profileData.middleName, profileData.lastName]
        .filter(Boolean)
        .join(" ");

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profileData.firstName.trim(),
          middle_name: profileData.middleName.trim() || null,
          last_name: profileData.lastName.trim(),
          email: profileData.email.trim(),
          phone: profileData.phone.trim() || null,
          full_name: fullName,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your changes have been saved.",
      });
    } catch (err) {
      console.error("Error updating profile:", err);
      toast({
        title: "Error",
        description: "Failed to save profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Profile</h1>
            <p className="text-muted-foreground">Update your name, email, and phone number.</p>
          </div>
          <div className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Account
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Personal Info</CardTitle>
            <CardDescription>Keep your contact details up to date.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) => handleProfileChange("firstName", e.target.value)}
                      className={errors.firstName ? "border-destructive" : ""}
                    />
                    {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) => handleProfileChange("lastName", e.target.value)}
                      className={errors.lastName ? "border-destructive" : ""}
                    />
                    {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="middleName">Middle Name</Label>
                  <Input
                    id="middleName"
                    value={profileData.middleName}
                    onChange={(e) => handleProfileChange("middleName", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) => handleProfileChange("email", e.target.value)}
                    className={errors.email ? "border-destructive" : ""}
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={profileData.phone}
                    onChange={(e) => handleProfileChange("phone", e.target.value)}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button type="submit" className="sm:flex-1" disabled={isSaving || !user}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => signOut()} className="sm:flex-1">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log Out
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* OneDrive Connection Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              OneDrive Connection
            </CardTitle>
            <CardDescription>
              Connect your Microsoft OneDrive account to access and sync files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isOneDriveConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium text-primary">Connected</p>
                    {oneDriveUser && (
                      <p className="text-sm text-muted-foreground">
                        {oneDriveUser.displayName} ({oneDriveUser.mail || oneDriveUser.userPrincipalName})
                      </p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  onClick={disconnectOneDrive}
                  className="w-full sm:w-auto"
                >
                  <CloudOff className="mr-2 h-4 w-4" />
                  Disconnect OneDrive
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your OneDrive account to browse and manage files directly from the portal.
                </p>
                <Button 
                  onClick={connectOneDrive} 
                  disabled={isOneDriveLoading}
                  className="w-full sm:w-auto"
                >
                  {isOneDriveLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Cloud className="mr-2 h-4 w-4" />
                      Connect OneDrive
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
