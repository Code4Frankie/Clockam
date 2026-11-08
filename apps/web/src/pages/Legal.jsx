import { Link } from 'react-router-dom';
import SiteFooter from '../components/SiteFooter.jsx';
import './landing.css';

const UPDATED = '8 November 2026';

function Page({ title, intro, sections }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link to="/" className="lp-brand" aria-label="ClockAm home"><img src="/logo.png" alt="ClockAm" width="48" height="48" /></Link>
          <div className="lp-nav-cta"><Link className="lp-btn ghost" to="/login">Sign in</Link></div>
        </div>
      </header>
      <main className="lp-doc lp-wrap">
        <h1>{title}</h1>
        <p className="lp-doc-date">Last updated {UPDATED}</p>
        <p className="lp-lede">{intro}</p>
        {sections.map(([h, ...paras]) => (
          <section key={h}>
            <h2>{h}</h2>
            {paras.map((p) => (Array.isArray(p) ? <ul key={p[0]}>{p.map((li) => <li key={li}>{li}</li>)}</ul> : <p key={p}>{p}</p>))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}

export function Privacy() {
  return (
    <Page
      title="Privacy notice"
      intro="ClockAm records when people arrive at and leave a workplace. This page explains what information ClockAm handles, why, and who can see it."
      sections={[
        ['Who is responsible', 'ClockAm is run by Frankiecode Solutions. Your workplace (your employer or organisation) decides to use ClockAm and decides how attendance records are used. Frankiecode Solutions handles the records on the workplace’s behalf to provide the service.'],
        ['What we collect', [
          'Account details: name, email address, staff ID, department, phone number if one is added, and role.',
          'Attendance: clock-in and clock-out times, whether you were late, the method used (for example phone fingerprint, scanner or manual correction), and which device was used.',
          'Location: your phone or laptop location at the moment you clock in, but only if your workplace turns on the location check. Scanners and kiosks do not collect it.',
          'Assistant: when an owner, admin or manager uses the ClockAm assistant, we keep a record of which lookups and changes it made (not the text of the chat), for a limited time.',
        ]],
        ['Your fingerprint', 'ClockAm does not receive or store your fingerprint or a copy of it when you clock in with a phone, laptop or security key. Your device checks your finger and sends ClockAm a signed confirmation. ClockAm keeps only a public key that can check that confirmation. If your workplace uses a USB scanner, the fingerprint template is stored on the computer the scanner is plugged into. If it uses a standalone unit, the template is stored on that unit. In both cases it stays at the workplace.'],
        ['Why we use it', [
          'To record attendance and show who is in, late or absent.',
          'To prepare reports your workplace can export, for example for payroll.',
          'To keep accounts secure, and to fix problems.',
        ]],
        ['Who can see it', [
          'You can see your own records.',
          'Managers, admins and the owner of your workplace can see attendance for that workplace.',
          'Frankiecode Solutions staff may access records only to run, support and secure the service.',
          'Service providers that help us run ClockAm: website and server hosting, the database, and an AI provider that powers the assistant. When the assistant answers a question, the names, staff IDs and times it looks up are sent to that AI provider to write the answer. When email is switched on, an email provider sends password reset messages.',
        ]],
        ['Where it is kept', 'Records are held on servers of our hosting and database providers, which may be outside Nigeria. Pages and the app use encrypted connections. Some standalone attendance units can only use unencrypted connections, depending on the model.'],
        ['How long we keep it', 'Attendance records are kept while your workplace uses ClockAm. A workplace can ask us to delete its records. Assistant records are kept for a limited period and then removed.'],
        ['Your rights', 'Under the Nigeria Data Protection Act 2023 you can ask to see the personal information held about you, ask for mistakes to be corrected, ask for it to be deleted where the law allows, and object to how it is used. Because your workplace decides how attendance is used, start by asking them. You can also contact us through www.frankiecode.org.ng. You may complain to the Nigeria Data Protection Commission.'],
        ['Changes', 'If we change this notice we will update the date at the top.'],
      ]}
    />
  );
}

export function Terms() {
  return (
    <Page
      title="Terms of use"
      intro="These terms apply when you use ClockAm, a service of Frankiecode Solutions. By creating a workplace or signing in, you agree to them."
      sections={[
        ['Who may use ClockAm', 'ClockAm is for workplaces and the people they add. The person who creates a workplace is its owner and is responsible for who they add and what those people can do.'],
        ['What a workplace must do', [
          'Tell staff that attendance, and fingerprint or location checks if used, are recorded, and have a lawful reason for doing so.',
          'Keep sign-in details private, and remove access for people who leave.',
          'Check that records are correct before using them for pay or discipline.',
        ]],
        ['What you must not do', [
          'Clock in or out for someone else, or help someone do it.',
          'Try to break into ClockAm, other workplaces’ records, or the service itself.',
          'Use ClockAm for anything unlawful.',
        ]],
        ['Your records', 'A workplace’s attendance records belong to that workplace. We use them only to provide the service, as described in the privacy notice.'],
        ['Availability', 'We work to keep ClockAm running, but we cannot promise it will always be available or free of errors. Phone and laptop fingerprint clock-in needs an internet connection. Keep your own copy of anything you must keep, for example by exporting reports.'],
        ['Fees', 'ClockAm may later require payment for some features. We will tell you the price before you are charged.'],
        ['Our rights', 'ClockAm, its logo and software belong to Frankiecode Solutions. We may suspend an account that breaks these terms or puts others at risk.'],
        ['Our responsibility', 'To the extent the law allows, Frankiecode Solutions is not responsible for losses that come from using ClockAm, such as pay disputes caused by wrong records, or from times when the service is unavailable. Nothing here limits rights you have under Nigerian law that cannot be limited.'],
        ['Law and contact', 'These terms are governed by the laws of Nigeria. Questions can be sent through www.frankiecode.org.ng.'],
        ['Changes', 'If we change these terms we will update the date at the top. Using ClockAm after that means you accept the new terms.'],
      ]}
    />
  );
}
