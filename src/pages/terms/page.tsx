import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to home
        </Link>

        <h1
          className="text-3xl font-bold text-foreground mb-2"
          style={{ fontFamily: "Rajdhani, sans-serif" }}
        >
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: July 24, 2026
        </p>

        <div className="space-y-8 text-sm text-muted-foreground leading-relaxed">
          <Section title="1. Agreement to Terms">
            <p>
              By accessing or using MechPro ("the Platform"), operated by YourCarGuy806 LLC ("we," "us," or "our"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.
            </p>
            <p>
              These terms apply to all users of the Platform, including shop owners, technicians, employees, and any person interacting with the customer-facing features (booking portal, estimate approvals, invoices).
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              MechPro is a business management platform designed for mobile mechanics and independent auto repair shops. It provides tools for managing repair orders, scheduling, invoicing, payroll, customer communications, parts inventory, AI-assisted diagnostics, and marketing.
            </p>
          </Section>

          <Section title="3. Account Registration and Responsibility">
            <p>
              You must provide accurate information when creating an account. You are responsible for maintaining the security of your login credentials and for all activity that occurs under your account.
            </p>
            <p>
              If you believe your account has been compromised, contact us immediately at lee@yourcarguy806.com.
            </p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Upload false, misleading, or fraudulent information</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Interfere with or disrupt the Platform's infrastructure</li>
              <li>Use automated scripts or bots to access the Platform without our written consent</li>
              <li>Resell or redistribute access to the Platform without authorization</li>
            </ul>
          </Section>

          <Section title="5. Payments and Billing">
            <p>
              Certain features of MechPro require a paid subscription. By subscribing, you agree to pay the fees displayed at the time of purchase. Payments are processed securely through Stripe, our third-party payment processor.
            </p>
            <p>
              Subscription fees are billed on a recurring basis. You authorize us to charge your payment method on each billing cycle until you cancel.
            </p>
          </Section>

          <Section title="6. Cancellation and Refunds">
            <p>
              You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of your current billing period — you will retain access until then.
            </p>
            <p>
              Refunds are handled on a case-by-case basis. If you believe you are entitled to a refund, contact us at lee@yourcarguy806.com within 14 days of the charge. We do not provide refunds for partial billing periods or for time already used.
            </p>
            <p>
              Upon cancellation, your data will remain accessible for 30 days. After that period, your data may be permanently deleted.
            </p>
          </Section>

          <Section title="7. AI-Powered Features Disclaimer">
            <p>
              MechPro includes AI-powered features such as diagnostic suggestions, repair cost estimates, parts recommendations, and marketing content generation. These features are provided for informational and assistive purposes only.
            </p>
            <p className="font-semibold text-foreground">
              AI-generated content is not a substitute for professional mechanical judgment, inspection, or diagnosis.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>AI estimates and diagnostics may be inaccurate, incomplete, or inappropriate for your specific situation</li>
              <li>Always verify AI-generated information with qualified technician expertise before relying on it</li>
              <li>We are not liable for any damage, injury, or loss resulting from reliance on AI-generated suggestions</li>
              <li>AI-generated marketing content should be reviewed and edited before publishing</li>
            </ul>
          </Section>

          <Section title="8. SMS and Communication Terms">
            <p>
              MechPro enables you to send automated text messages (SMS) to your customers for repair status updates, appointment reminders, and estimate approvals. By using these features:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>You are responsible for obtaining proper consent from your customers before sending them text messages</li>
              <li>You agree to honor all opt-out requests promptly</li>
              <li>You acknowledge that message and data rates may apply to recipients</li>
              <li>You will not use the SMS features for spam, unsolicited marketing, or any purpose unrelated to the customer's service with your business</li>
            </ul>
            <p>
              SMS services are provided through Twilio. Standard messaging rates from the recipient's carrier may apply. Message frequency varies based on service activity.
            </p>
          </Section>

          <Section title="9. Third-Party Services">
            <p>
              MechPro integrates with third-party services to provide its functionality. These include but are not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Stripe</strong> — for payment processing</li>
              <li><strong>Twilio</strong> — for SMS messaging</li>
              <li><strong>Carfax</strong> — for vehicle history reporting (when enabled by your shop)</li>
              <li><strong>OpenAI</strong> — for AI-powered diagnostics and content generation</li>
            </ul>
            <p>
              Your use of these services is also subject to their respective terms of service and privacy policies. We are not responsible for the practices of third-party providers.
            </p>
          </Section>

          <Section title="10. Intellectual Property">
            <p>
              All content, design, code, and features of MechPro are the property of YourCarGuy806 LLC and are protected by copyright and intellectual property laws. You may not copy, modify, or distribute any part of the Platform without written permission.
            </p>
            <p>
              You retain ownership of all data you enter into the Platform (customer records, invoices, repair orders, etc.). By using MechPro, you grant us a limited license to store, process, and display your data solely for the purpose of providing the service.
            </p>
          </Section>

          <Section title="11. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, MechPro and YourCarGuy806 LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.
            </p>
            <p>
              This includes, without limitation, damages arising from:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Reliance on AI-generated diagnostics, estimates, or recommendations</li>
              <li>Service interruptions, data loss, or system failures</li>
              <li>Unauthorized access to your account</li>
              <li>Errors in invoicing, scheduling, or communication features</li>
            </ul>
            <p>
              Our total liability to you for any claims shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>
          </Section>

          <Section title="12. Warranty Disclaimer">
            <p>
              The Platform is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
            </p>
            <p>
              We do not warrant that the Platform will be uninterrupted, error-free, or completely secure.
            </p>
          </Section>

          <Section title="13. Indemnification">
            <p>
              You agree to indemnify and hold harmless YourCarGuy806 LLC from any claims, damages, or expenses (including reasonable attorney fees) arising from your use of the Platform, violation of these terms, or infringement of any rights of another party.
            </p>
          </Section>

          <Section title="14. Termination">
            <p>
              We reserve the right to suspend or terminate your account at any time for violation of these terms or for any conduct we deem harmful to other users or the Platform. Upon termination, your right to use the Platform ceases immediately.
            </p>
          </Section>

          <Section title="15. Governing Law">
            <p>
              These terms are governed by the laws of the State of South Dakota, without regard to its conflict of law provisions. Any disputes arising from these terms shall be resolved in the courts of South Dakota.
            </p>
          </Section>

          <Section title="16. Changes to These Terms">
            <p>
              We may update these Terms of Service from time to time. We will notify you of material changes by posting a notice within the application or by sending an email. Your continued use of the Platform after changes are posted constitutes acceptance of the revised terms.
            </p>
          </Section>

          <Section title="17. Contact">
            <p>
              If you have questions about these Terms of Service, contact us:
            </p>
            <ul className="list-none space-y-1">
              <li><strong>Email:</strong> lee@yourcarguy806.com</li>
              <li><strong>Website:</strong> yourcarguy806.com</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
