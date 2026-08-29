import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: July 24, 2026
        </p>

        <div className="space-y-8 text-sm text-muted-foreground leading-relaxed">
          <Section title="1. Who We Are">
            <p>
              MechPro is operated by YourCarGuy806 LLC ("we," "us," or "our"). This privacy policy explains how we collect, use, store, and share your information when you use our platform at yourcarguy806.com.
            </p>
            <p>
              For privacy-related questions, contact us at lee@yourcarguy806.com.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p>We collect the following types of information:</p>

            <h3 className="text-foreground font-medium mt-4 mb-2">Account and Profile Data</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Name, email address, phone number</li>
              <li>Business name, address, and contact details</li>
              <li>Login credentials and authentication data</li>
            </ul>

            <h3 className="text-foreground font-medium mt-4 mb-2">Customer Records</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Customer names, phone numbers, email addresses, and mailing addresses</li>
              <li>Vehicle information including VIN (Vehicle Identification Number), make, model, year, mileage, and license plate</li>
              <li>Repair history, service notes, and diagnostic information</li>
            </ul>

            <h3 className="text-foreground font-medium mt-4 mb-2">Financial Data</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Invoice amounts, payment records, and transaction history</li>
              <li>Payroll information (employee hours, pay rates)</li>
              <li>Payment card data is processed by Stripe and never stored on our servers</li>
            </ul>

            <h3 className="text-foreground font-medium mt-4 mb-2">Location Data</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>GPS coordinates for job tracking and route management (when enabled)</li>
              <li>Service location addresses</li>
            </ul>

            <h3 className="text-foreground font-medium mt-4 mb-2">Technical Data</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>IP address, browser type, device information</li>
              <li>Usage patterns, feature interactions, and session data</li>
              <li>Photos uploaded for repair documentation</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide and operate the MechPro platform</li>
              <li>To process invoices, payments, and payroll</li>
              <li>To send repair status updates via email and SMS</li>
              <li>To provide AI-powered diagnostics and repair estimates</li>
              <li>To generate marketing content and social media posts</li>
              <li>To report service history to Carfax (when enabled by your shop)</li>
              <li>To detect, prevent, and address security threats and fraud</li>
              <li>To comply with legal obligations</li>
            </ul>
          </Section>

          <Section title="4. Third-Party Services We Share Data With">
            <p>
              We share your data with the following third-party service providers solely to operate the Platform:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Stripe</strong> (stripe.com) — Processes payments securely. Receives customer billing information when invoices are paid online.</li>
              <li><strong>Twilio</strong> (twilio.com) — Delivers SMS text messages. Receives customer phone numbers when you send status updates or appointment reminders.</li>
              <li><strong>Carfax</strong> (carfax.com) — Records vehicle service history. Receives VIN, mileage, and service details when you report a completed repair. This feature is optional and must be enabled by the shop owner.</li>
              <li><strong>AWS Bedrock</strong> (Amazon Web Services) — Powers AI diagnostics and content generation using Anthropic Claude and Amazon Nova models. Receives vehicle symptoms, repair descriptions, and business context. No personal customer identity data is sent to AI models.</li>
              <li><strong>Amazon Web Services</strong> (aws.amazon.com) — Hosts the platform infrastructure, manages authentication (Cognito), sends emails (SES), and stores files (S3).</li>
            </ul>
            <p>
              We do not sell your personal information to any party.
            </p>
          </Section>

          <Section title="5. SMS and Email Communications">
            <p>
              When you or your customers interact with MechPro, we may send:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Transactional messages:</strong> Repair status updates, invoice delivery, estimate approvals, appointment confirmations</li>
              <li><strong>Account messages:</strong> Password resets, security alerts, billing notices</li>
            </ul>
            <p>
              SMS messages are sent only to customers whose shop has SMS enabled and who have not opted out. Customers can opt out at any time by contacting their service provider or by requesting opt-out through the platform. Message and data rates from your mobile carrier may apply.
            </p>
          </Section>

          <Section title="6. Data Storage and Security">
            <p>
              Your data is stored on secure cloud infrastructure with encryption at rest and in transit. We implement industry-standard security measures including:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Encrypted data storage and transmission (TLS/SSL)</li>
              <li>Role-based access controls</li>
              <li>Regular security monitoring</li>
              <li>Secure authentication through Amazon Cognito</li>
            </ul>
            <p>
              While we take all reasonable precautions, no system is 100% secure. We cannot guarantee absolute security of your data.
            </p>
          </Section>

          <Section title="7. Data Retention">
            <p>
              We retain your data for as long as your account is active. If you cancel your account:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Your data remains accessible for 30 days after cancellation</li>
              <li>After 30 days, personal data is permanently deleted</li>
              <li>We may retain anonymized, aggregated data for analytics purposes</li>
              <li>Data required by law (tax records, financial transactions) may be retained longer as required</li>
            </ul>
          </Section>

          <Section title="8. Your Rights">
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Access</strong> — Request a copy of the personal data we hold about you</li>
              <li><strong>Correction</strong> — Request we fix inaccurate data</li>
              <li><strong>Deletion</strong> — Request we delete your personal data</li>
              <li><strong>Portability</strong> — Receive your data in a structured, machine-readable format</li>
              <li><strong>Objection</strong> — Object to or restrict certain processing of your data</li>
              <li><strong>Withdraw consent</strong> — Withdraw previously given consent at any time</li>
            </ul>
            <p>
              To exercise any of these rights, email us at lee@yourcarguy806.com. We will respond within 30 days.
            </p>
          </Section>

          <Section title="9. Cookies">
            <p>
              We use essential cookies to maintain your login session and authentication state. We may also use analytics cookies to understand platform usage. You can manage cookie preferences through your browser settings.
            </p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>
              MechPro is not intended for individuals under 16 years of age. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child under 16, we will delete it promptly.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this privacy policy from time to time. Material changes will be communicated by posting a notice within the application or by email. The "Last updated" date at the top reflects the most recent revision.
            </p>
          </Section>

          <Section title="12. Contact Us">
            <p>
              For questions, concerns, or data requests:
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
