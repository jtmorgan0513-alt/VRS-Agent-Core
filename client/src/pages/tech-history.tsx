import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Submission } from "@shared/schema";

export default function TechHistoryPage() {
  const { data, isLoading } = useQuery<{ submissions: Submission[] }>({
    queryKey: ["/api/submissions"],
  });

  const submissions = data?.submissions || [];

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold" data-testid="text-history-title">Submission History</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))
        ) : submissions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No submissions found.
            </CardContent>
          </Card>
        ) : (
          submissions.map((sub) => (
            <Link key={sub.id} href={`/tech/submissions/${sub.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium" data-testid={`text-history-so-${sub.id}`}>
                      SO #{sub.serviceOrder}
                    </p>
                    <StatusBadge status={sub.stage1Status} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground capitalize">
                      {sub.applianceType.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">
                    {sub.requestType.replace(/_/g, " ")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "approved":
      return <Badge className="bg-green-600 text-white border-green-600">Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "invalid":
      return <Badge variant="secondary">Not Applicable</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
