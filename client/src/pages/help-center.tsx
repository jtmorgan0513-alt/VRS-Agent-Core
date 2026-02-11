import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, LifeBuoy } from "lucide-react";

interface HelpItem {
  title: string;
  content: string;
}

const gettingStartedItems: HelpItem[] = [
  {
    title: "What is VRS Submit?",
    content:
      "VRS Submit is a digital authorization platform that replaces the traditional call-in process for Sears Home Services. It allows technicians to submit authorization requests digitally, VRS agents to review and approve them, and administrators to manage the entire workflow from a centralized dashboard.",
  },
  {
    title: "How do I log in?",
    content:
      "Navigate to the login page and enter your email address and password. After successful authentication, you will be automatically redirected to the appropriate dashboard based on your assigned role (Technician, VRS Agent, or Admin).",
  },
  {
    title: "Understanding Roles",
    content:
      "There are three roles in VRS Submit. Technicians can submit authorization requests for parts and services. VRS Agents review incoming submissions and approve or reject them, then send authorization codes. Admins manage user accounts, assign agent divisions, and view analytics across the platform.",
  },
  {
    title: "First-Time Setup",
    content:
      "When you first log in, an onboarding wizard will guide you through the key features of VRS Submit based on your role. The wizard covers navigation, core workflows, and important tips. You can restart the onboarding wizard at any time from your profile settings.",
  },
];

const howToGuidesItems: HelpItem[] = [
  {
    title: "Submitting an Authorization Request",
    content:
      "For Technicians: Start by navigating to the submission page. Choose the request type, select the appliance category, add relevant details about the issue and required parts, upload photographic evidence of the problem, and submit the request. Your submission will be automatically assigned to an available VRS agent for review.",
  },
  {
    title: "Understanding Submission Status",
    content:
      "For Technicians: Each submission has a status indicator. Pending (yellow) means your request is awaiting agent review. Approved (green) means the request has been approved at Stage 1. Rejected (red) means the request was not approved and includes a reason. Auth Code Sent (blue) means the authorization code has been generated and sent to you via SMS.",
  },
  {
    title: "Receiving Authorization Codes",
    content:
      "For Technicians: Once your submission is fully approved, you will receive the authorization code via SMS to your registered phone number. The code is also visible on the submission detail page within the app. Use this code to proceed with the authorized repair or parts order.",
  },
  {
    title: "Resubmitting After Rejection",
    content:
      "For Technicians: If your submission is rejected, review the rejection reason provided by the agent. Create a new submission with additional information or evidence that addresses the rejection reason. Ensure all required fields are filled out completely before resubmitting.",
  },
  {
    title: "Reviewing Stage 1 Submissions",
    content:
      "For VRS Agents: Open a submission from your review queue. Carefully review the technician's details, photos, and supporting evidence. You can approve the submission to move it to Stage 2, or reject it with a clear reason explaining why the request cannot be approved at this time.",
  },
  {
    title: "Sending Authorization Codes (Stage 2)",
    content:
      "For VRS Agents: After a submission has been approved at Stage 1, it moves to Stage 2. Enter the authorization code in the designated field. Once submitted, the technician will receive the code via SMS notification and it will also appear on their submission detail page.",
  },
  {
    title: "Filtering and Managing Your Queue",
    content:
      "For VRS Agents: Use the appliance type filters to narrow down your queue to specific categories. Toggle between viewing only submissions assigned to you (personal queue) and all available submissions (all queue) to manage your workload effectively.",
  },
  {
    title: "Batch Processing Tips",
    content:
      "For VRS Agents: Work through your queue efficiently by processing similar appliance types together. Use keyboard shortcuts where available to speed up review. Focus on oldest submissions first to maintain service level targets and reduce wait times for technicians.",
  },
  {
    title: "Creating and Managing Users",
    content:
      "For Admins: Navigate to the user management section to add new users. Set the appropriate role for each user (Technician, VRS Agent, or Admin). You can activate or deactivate user accounts as needed without deleting their data.",
  },
  {
    title: "Assigning Agent Divisions",
    content:
      "For Admins: Navigate to the divisions management page. For each VRS agent, check the applicable appliance types they are qualified to review. This determines which submissions are automatically routed to each agent based on the appliance category.",
  },
  {
    title: "Viewing Analytics",
    content:
      "For Admins: The analytics dashboard provides key metrics including total submission counts, approval and rejection rates, and average processing times. Use these insights to identify bottlenecks, balance agent workloads, and track overall system performance.",
  },
];

const faqItems: HelpItem[] = [
  {
    title: "What happens when I submit an authorization request?",
    content:
      "Your authorization submission is automatically assigned to an available VRS agent based on the appliance type you selected. The agent will review your request, supporting details, and uploaded evidence before making a decision.",
  },
  {
    title: "How long does approval take?",
    content:
      "Approval times depend on the current queue volume and agent availability. Most submissions are reviewed within business hours. If your submission has been pending for an extended period, check with your supervisor for assistance.",
  },
  {
    title: "Can I edit a submission after sending?",
    content:
      "No, submissions cannot be edited once they have been sent. If you need to make changes or provide additional information, you will need to create a new submission with the updated details.",
  },
  {
    title: "What if I don't receive my SMS notification?",
    content:
      "First, verify that your phone number is correctly registered in your profile. Check your message inbox and ensure your device has cellular reception. If you still do not receive the notification, contact your supervisor for assistance.",
  },
  {
    title: "How are submissions assigned to agents?",
    content:
      "Submissions are automatically assigned to agents based on their specializations and division assignments. Each agent is configured to handle specific appliance types, and the system routes submissions to qualified agents with available capacity.",
  },
  {
    title: "What does 'B2B Coming Soon' mean?",
    content:
      "The B2B (Business-to-Business) feature is currently under development and not yet available. This will support warranty providers such as Asurion and Allstate. When launched, it will enable direct integration with these third-party warranty services.",
  },
];

const troubleshootingItems: HelpItem[] = [
  {
    title: "I can't log in",
    content:
      "Double-check that you are entering the correct email address and password. Ensure your account has been activated by an administrator. If you continue to experience issues, contact your admin to verify your account status and reset your credentials if necessary.",
  },
  {
    title: "My submission is stuck on Pending",
    content:
      "A submission may remain in Pending status if no agent is currently available to review it, or if the queue volume is high. Check with your supervisor to confirm that agents are active and available for your appliance type.",
  },
  {
    title: "I didn't receive an authorization code",
    content:
      "Verify that the phone number in your profile is correct and that your device can receive SMS messages. You can also check the submission detail page within the app, where the authorization code will be displayed once it has been sent.",
  },
  {
    title: "The app won't install on my phone",
    content:
      "VRS Submit is a Progressive Web App (PWA). To install it, open the app in Chrome (Android) or Safari (iOS). Tap the browser menu (three dots or share icon), then select 'Add to Home Screen'. The app will appear as an icon on your device.",
  },
  {
    title: "Session expired unexpectedly",
    content:
      "Authentication tokens expire after 7 days for security purposes. When your session expires, you will be redirected to the login page. Simply re-enter your credentials to start a new session. This is normal behavior and helps protect your account.",
  },
];

const tabSections = [
  { id: "getting-started", label: "Getting Started", testId: "tab-getting-started", items: gettingStartedItems },
  { id: "how-to", label: "How-To Guides", testId: "tab-how-to", items: howToGuidesItems },
  { id: "faqs", label: "FAQs", testId: "tab-faqs", items: faqItems },
  { id: "troubleshooting", label: "Troubleshooting", testId: "tab-troubleshooting", items: troubleshootingItems },
];

function filterItems(items: HelpItem[], query: string): HelpItem[] {
  if (!query.trim()) return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(lower) ||
      item.content.toLowerCase().includes(lower)
  );
}

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = tabSections.map((section) => ({
    ...section,
    filteredItems: filterItems(section.items, searchQuery),
  }));

  const hasAnyResults = filteredSections.some((s) => s.filteredItems.length > 0);

  let globalIndex = 0;

  return (
    <div
      data-testid="help-center-page"
      className="flex-1 overflow-y-auto p-4 md:p-6"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-7 w-7 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">Help Center</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-help-search"
            placeholder="Search help articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {!hasAnyResults && searchQuery.trim() ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No results found for "{searchQuery}"
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="getting-started">
            <TabsList className="flex flex-wrap gap-1 w-full">
              {filteredSections.map((section) => (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  data-testid={section.testId}
                >
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {filteredSections.map((section) => {
              const startIndex = globalIndex;
              globalIndex += section.filteredItems.length;

              return (
                <TabsContent key={section.id} value={section.id}>
                  {section.filteredItems.length === 0 ? (
                    <Card>
                      <CardContent className="p-6 text-center text-muted-foreground">
                        No results found in {section.label}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="p-4 md:p-6">
                        <Accordion type="single" collapsible>
                          {section.filteredItems.map((item, idx) => (
                            <AccordionItem
                              key={idx}
                              value={`item-${startIndex + idx}`}
                              data-testid={`accordion-item-${startIndex + idx}`}
                            >
                              <AccordionTrigger>{item.title}</AccordionTrigger>
                              <AccordionContent>{item.content}</AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </div>
  );
}
