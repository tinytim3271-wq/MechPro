import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated } from "convex/react";
import { UserCog, MapPin, Users, Plus, Navigation, RefreshCw, Clock, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import EmployeeCard from "./_components/EmployeeCard.tsx";
import InviteEmployeeDialog from "./_components/InviteEmployeeDialog.tsx";
import DispatchMap from "./_components/DispatchMap.tsx";
import LiveTrackingPanel from "./_components/LiveTrackingPanel.tsx";
import DeductionsPanel from "./_components/DeductionsPanel.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

function EmployeesContent() {
  const org = useQuery(api.organizations.getCurrentOrg, {});
  const orgId = org?._id as Id<"organizations"> | undefined;

  const employees = useQuery(api.employees.listMembers, orgId ? { orgId } : "skip");
  const locations = useQuery(api.employees.getLatestLocations, orgId ? { orgId } : "skip");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("team");

  if (!org || employees === undefined || locations === undefined) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const activeEmployees = employees.filter((e) => e.isActive);
  const pendingEmployees = employees.filter(
    (e) => !e.isActive && e.inviteStatus === "pending"
  );
  const mechanicsOnField = locations.filter((l) => l.lastPing !== null);

  // Map locations to the shape DispatchMap expects
  const dispatchLocations = locations.map((l) => ({
    memberId: l.memberId,
    memberName: l.userName,
    role: l.role,
    latestPing: l.lastPing
      ? { lat: l.lastPing.lat, lng: l.lastPing.lng, accuracy: l.lastPing.accuracy, timestamp: l.lastPing.timestamp }
      : null,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <UserCog className="text-primary" size={28} />
          <div>
            <h1
              className="text-3xl font-bold text-foreground"
              style={{ fontFamily: "Rajdhani, sans-serif" }}
            >
              Employees
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeEmployees.length} active ·{" "}
              {mechanicsOnField.length} on the road
            </p>
          </div>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="cursor-pointer gap-2">
          <Plus size={16} />
          Invite Employee
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Staff", value: activeEmployees.length, icon: Users },
          { label: "Mechanics", value: activeEmployees.filter((e) => e.role === "mechanic" || e.role === "mobile_mechanic").length, icon: UserCog },
          { label: "On The Road", value: mechanicsOnField.length, icon: Navigation },
          { label: "Pending Invites", value: pendingEmployees.length, icon: RefreshCw },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4 text-center">
            <Icon size={18} className="text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "Rajdhani, sans-serif" }}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="team" className="cursor-pointer">Team ({activeEmployees.length})</TabsTrigger>
          <TabsTrigger value="timeclock" className="cursor-pointer">
            <Clock size={14} className="mr-1" />
            Time Clock
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="cursor-pointer">
            <MapPin size={14} className="mr-1" />
            GPS Dispatch
          </TabsTrigger>
          <TabsTrigger value="deductions" className="cursor-pointer">
            <Banknote size={14} className="mr-1" />
            Deductions
          </TabsTrigger>
          {pendingEmployees.length > 0 && (
            <TabsTrigger value="pending" className="cursor-pointer">
              Pending ({pendingEmployees.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* Team Tab */}
        <TabsContent value="team" className="mt-4">
          {activeEmployees.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Users /></EmptyMedia>
                <EmptyTitle>No employees yet</EmptyTitle>
                <EmptyDescription>Invite your first team member to get started.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setInviteOpen(true)}>Invite Employee</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeEmployees.map((emp) => (
                <EmployeeCard
                  key={emp._id}
                  employee={{
                    ...emp,
                    userName: emp.userName ?? emp.inviteEmail ?? "Unknown",
                    userEmail: emp.userEmail ?? emp.inviteEmail,
                    userPhone: emp.userPhone,
                  }}
                  canEdit={true}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Time Clock Tab */}
        <TabsContent value="timeclock" className="mt-4">
          <LiveTrackingPanel />
        </TabsContent>

        {/* GPS Dispatch Tab */}
        <TabsContent value="dispatch" className="mt-4 space-y-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <DispatchMap mechanics={dispatchLocations} />
          </div>

          {locations.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><MapPin /></EmptyMedia>
                <EmptyTitle>No location data yet</EmptyTitle>
                <EmptyDescription>
                  Mechanics need to share their location from the app for GPS tracking to work.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {locations.map((loc) => (
                <div
                  key={loc.memberId}
                  className="bg-card border border-border rounded-lg p-4 flex items-center gap-3"
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      loc.lastPing ? "bg-green-500" : "bg-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground">{loc.userName}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {loc.role.replace("_", " ")}
                    </div>
                  </div>
                  {loc.lastPing ? (
                    <div className="text-xs text-right text-muted-foreground">
                      <div className="flex items-center gap-1 text-green-400">
                        <MapPin size={11} />
                        Active
                      </div>
                      <div>{new Date(loc.lastPing.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No data</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Deductions Tab */}
        <TabsContent value="deductions" className="mt-4">
          <DeductionsPanel orgId={orgId!} />
        </TabsContent>

        {/* Pending Tab */}
        {pendingEmployees.length > 0 && (
          <TabsContent value="pending" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pendingEmployees.map((emp) => (
                <EmployeeCard
                  key={emp._id}
                  employee={{
                    ...emp,
                    userName: emp.userName ?? emp.inviteEmail ?? "Unknown",
                    userEmail: emp.userEmail ?? emp.inviteEmail,
                    userPhone: emp.userPhone,
                  }}
                  canEdit={true}
                />
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {orgId && (
        <InviteEmployeeDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          orgId={orgId}
        />
      )}
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full p-12">
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <EmployeesContent />
      </Authenticated>
    </>
  );
}
