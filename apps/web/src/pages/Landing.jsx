import { useInstall } from '../useInstall.js';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import './landing.css';

const ICONS = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  sheet: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M17 14.2c2.4.3 4 2.3 4 4.8" />
    </>
  ),
  chat: <path d="M4 5h16v11H10l-5 4v-4H4z" />,
  shield: <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

function Icon({ name }) {
  return (
    <svg className="lp-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

function Photo({ name, alt, sizes, w, h, priority = false }) {
  return (
    <picture>
      <source type="image/webp" srcSet={`/landing/${name}-640.webp 640w, /landing/${name}-1200.webp 1200w`} sizes={sizes} />
      <img
        src={`/landing/${name}-1200.jpg`}
        srcSet={`/landing/${name}-640.jpg 640w, /landing/${name}-1200.jpg 1200w`}
        sizes={sizes}
        alt={alt}
        width={w}
        height={h}
        loading={priority ? 'eager' : 'lazy'}
        fetchpriority={priority ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  );
}

// The current time in Lagos, the same clock the kiosk shows.
function useLagosTime() {
  const read = () =>
    new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(new Date());
  const [time, setTime] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setTime(read()), 15000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function ComingSoon({ open, onClose }) {
  const ref = useRef(null);
  const { canInstall, install } = useInstall();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="lp-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="soon-title">
      <h2 id="soon-title">The ClockAm app is coming soon</h2>
      <p>
        The store app is still being built. You can already put ClockAm on your home screen: in Chrome open the menu and tap
        Install app, on iPhone tap Share then Add to Home Screen. Then sign in and set up your phone's face or fingerprint once.
      </p>
      <div className="lp-actions">
        {canInstall && <button type="button" className="lp-btn" onClick={async () => { await install(); onClose(); }}>Install ClockAm now</button>}
        <Link className={canInstall ? 'lp-btn ghost' : 'lp-btn'} to="/login">Sign in on this phone</Link>
        <button type="button" className="lp-btn ghost" onClick={onClose} autoFocus>Close</button>
      </div>
    </dialog>
  );
}

const FAQ = [
  {
    q: 'Do you store fingerprints?',
    a: 'No. The phone or laptop checks the finger and sends back a signed yes. ClockAm keeps only a public key that can confirm that signature, never the fingerprint itself.',
  },
  {
    q: 'Does every employee need a smartphone?',
    a: 'No. A front-desk Windows laptop with Windows Hello, or a fingerprint security key, works too. Support for USB and handheld scanners is rolling out.',
  },
  {
    q: 'What happens if the internet drops?',
    a: 'ClockAm needs an internet connection to record a clock-in today. Offline clock-in is on our list.',
  },
  {
    q: 'Can I use the records for payroll?',
    a: 'Yes. Export days present, days late and hours worked for each person, for any date range, as a CSV file.',
  },
  {
    q: 'What if someone forgets to clock out?',
    a: 'An admin can set the time on the Edit attendance page, and every change is saved with a reason. You can also turn on automatic closing, so a day left open is closed at closing time and marked automatic.',
  },
  {
    q: 'Who builds ClockAm?',
    a: 'ClockAm is built and run by Frankiecode Solutions.',
  },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const time = useLagosTime();
  const [soon, setSoon] = useState(false);
  const { canInstall, install } = useInstall();
  const getApp = () => (canInstall ? install() : setSoon(true));

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>

      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link to="/" className="lp-brand" aria-label="ClockAm home">
            <img src="/logo.png" alt="ClockAm" width="48" height="48" />
          </Link>
          <nav className="lp-links" aria-label="Page sections">
            <a href="#features">What it does</a>
            <a href="#how">How it works</a>
            <a href="#uses">Where it fits</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className="lp-nav-cta">
            <Link className="lp-btn ghost" to="/login">Sign in</Link>
            <Link className="lp-btn" to="/register">Get started</Link>
          </div>
          <button type="button" className="lp-btn ghost lp-dl-nav" onClick={getApp}>{canInstall ? 'Install the app' : 'Download the app'}</button>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <h1 id="hero-title">Clock in with a fingerprint. Nobody can sign for a friend.</h1>
              <p className="lp-lede">
                ClockAm records who arrives, who is late and who leaves, from a phone, a laptop or the front-desk kiosk. Then it turns
                that into attendance reports you can export.
              </p>
              <div className="lp-actions">
                <Link className="lp-btn big" to="/register">Create your workplace</Link>
                <button type="button" className="lp-btn big ghost" onClick={getApp}>{canInstall ? 'Install ClockAm on this phone' : 'Download the ClockAm app'}</button>
              </div>
              <ul className="lp-facts">
                <li><Icon name="check" />Fingerprints stay on the device</li>
                <li><Icon name="check" />Phones and Windows laptops today</li>
                <li><Icon name="check" />Lagos time by default</li>
              </ul>
            </div>

            <figure className="lp-figure">
              <Photo
                name="office-checkin"
                alt="A man scans his fingerprint on a check-in terminal at a reception desk while a receptionist smiles. The screen reads Clocked in."
                sizes="(max-width: 960px) 100vw, 560px"
                w={1448}
                h={1086}
                priority
              />
              <div className="lp-scan" role="img" aria-label={`Sample confirmation: Chidinma A. clocked in at ${time}`}>
                <span className="lp-tick"><Icon name="check" /></span>
                <span>
                  <b>Clocked in</b>
                  <span className="lp-scan-meta">Chidinma A. at <time>{time}</time></span>
                  <small>Sample screen</small>
                </span>
              </div>
            </figure>
          </div>
        </section>

        <section className="lp-band" aria-label="What changes">
          <div className="lp-wrap">
            <p>No paper register.</p>
            <p>No buddy clocking.</p>
            <p>No month-end guessing.</p>
          </div>
        </section>

        <section id="features" className="lp-section lp-wash" aria-labelledby="features-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2 id="features-title">Scanning, lateness and reports in one place</h2>
              <p className="lp-lede">The front desk scans. Managers watch the day fill in. Payroll gets a clean export.</p>
            </div>

            <div className="lp-bento">
              <article className="lp-tile span-4">
                <h3>See today at a glance</h3>
                <p>Who is in, who is late and who has not arrived yet, updated as people clock in.</p>
                <div className="lp-mock lp-dash" aria-hidden="true">
                  <div className="lp-dash-stats">
                    <div><b>24</b><span>Staff</span></div>
                    <div><b className="ok">19</b><span>Clocked in</span></div>
                    <div><b className="warn">3</b><span>Late</span></div>
                    <div><b className="bad">5</b><span>Not in yet</span></div>
                  </div>
                  <ul className="lp-dash-rows">
                    <li><span>Tunde B.</span><time>07:52</time><em className="ok">On time</em></li>
                    <li><span>Amaka O.</span><time>08:21</time><em className="warn">Late</em></li>
                    <li><span>Ibrahim S.</span><time>07:58</time><em className="ok">On time</em></li>
                    <li><span>Ngozi E.</span><time>08:34</time><em className="warn">Late</em></li>
                  </ul>
                  <p className="lp-sample">Sample data</p>
                </div>
              </article>

              <article className="lp-tile span-2">
                <h3>A kiosk for the front desk</h3>
                <p>Staff type their ID and touch their fingerprint sensor. The screen confirms in a second.</p>
                <div className="lp-mock lp-kiosk" aria-hidden="true">
                  <strong>{time}</strong>
                  <div className="lp-field">EMP-014</div>
                  <div className="lp-kbtn">Clock in / out</div>
                  <p className="lp-sample">Sample screen</p>
                </div>
              </article>

              <article className="lp-tile span-2">
                <Icon name="clock" />
                <h3>Late marks without the arguing</h3>
                <p>Anyone who clocks in after the start time and grace period is flagged automatically.</p>
              </article>

              <article className="lp-tile span-2">
                <Icon name="sheet" />
                <h3>Reports you can export</h3>
                <p>Days present, days late and hours worked for each person, as a CSV for payroll.</p>
              </article>

              <article className="lp-tile span-2">
                <Icon name="users" />
                <h3>The right access for each person</h3>
                <p>Owners and admins manage staff. Managers see attendance. Employees see only their own record.</p>
              </article>

              <article className="lp-tile span-6 lp-assist">
                <div>
                  <Icon name="chat" />
                  <h3>Ask ClockAm</h3>
                  <p>
                    Type a question in plain English, like who is late today or who forgot to clock out. The assistant looks it up and
                    prepares any fix, and nothing changes until you confirm. It can never clock anyone in or out.
                  </p>
                </div>
                <div className="lp-mock lp-chat" aria-hidden="true">
                  <p className="you">Who forgot to clock out yesterday?</p>
                  <p className="bot">Two people: Amaka O. and Ibrahim S. I can prepare a correction for each.</p>
                  <div className="lp-confirm"><span>Set Amaka O. clock-out to 17:00</span><b>Confirm</b></div>
                  <p className="lp-sample">Sample chat</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="how" className="lp-section" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2 id="how-title">From sign-up to the first clock-in</h2>
            </div>
            <ol className="lp-steps">
              <li>
                <h3>Create your workplace</h3>
                <p>Sign up as the owner, then add your staff with a Staff ID each.</p>
              </li>
              <li>
                <h3>Enrol a fingerprint</h3>
                <p>Each person signs in once on their phone or Windows Hello laptop and registers their fingerprint. It happens one time.</p>
              </li>
              <li>
                <h3>Clock in and out</h3>
                <p>Open the kiosk link at the front desk, or clock in from a phone browser. Managers see it on the dashboard straight away.</p>
              </li>
            </ol>
          </div>
        </section>

        <section id="uses" className="lp-section lp-wash" aria-labelledby="uses-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2 id="uses-title">Built for places where attendance matters</h2>
              <p className="lp-lede">Clinics, churches, factories and events work the same way: anywhere you need to know who showed up.</p>
            </div>
            <div className="lp-uses">
              <figure>
                <Photo
                  name="office-checkin"
                  alt="A man scans his fingerprint on a check-in terminal at a reception desk."
                  sizes="(max-width: 960px) 100vw, 560px"
                  w={1448}
                  h={1086}
                />
                <figcaption>
                  <h3>Offices, schools and academies</h3>
                  <p>Staff check in at reception, and managers know who is late before the morning meeting.</p>
                </figcaption>
              </figure>
              <figure>
                <Photo
                  name="training-checkin"
                  alt="Footballers in blue kit walk past a Training Check-In sign while one scans his fingerprint on a terminal showing Clocked In."
                  sizes="(max-width: 960px) 100vw, 560px"
                  w={1536}
                  h={1024}
                />
                <figcaption>
                  <h3>Sports clubs and training grounds</h3>
                  <p>Players and staff check in on arrival, and the club keeps a record of who attended each day.</p>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="devices" className="lp-section" aria-labelledby="devices-title">
          <div className="lp-wrap lp-devices">
            <img className="lp-scanner" src="/landing/scanner.webp" alt="Close-up of a fingerprint terminal showing Clocked In at 07:12 AM." width="390" height="369" loading="lazy" decoding="async" />
            <div>
              <div className="lp-head">
                <h2 id="devices-title">Works with the devices you already have</h2>
              </div>
              <ul className="lp-device-list">
                <li>
                  <div>
                    <h3>Phones and laptops with fingerprint sensors</h3>
                    <p>Phones with a fingerprint sensor, Windows Hello laptops and fingerprint security keys.</p>
                  </div>
                  <span className="lp-chip now">Available now</span>
                </li>
                <li>
                  <div>
                    <h3>USB and handheld scanners</h3>
                    <p>Connect through a small helper app on the front-desk computer. Ask us which models are supported.</p>
                  </div>
                  <span className="lp-chip soon">Rolling out</span>
                </li>
                <li>
                  <div>
                    <h3>ClockAm mobile app</h3>
                    <p>A dedicated app for clocking in from a phone.</p>
                  </div>
                  <button type="button" className="lp-chip later lp-chip-btn" onClick={() => setSoon(true)}>Coming soon</button>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-section lp-dark" aria-labelledby="privacy-title">
          <div className="lp-wrap lp-dark-in">
            <div>
              <h2 id="privacy-title">Fingerprints stay on the device</h2>
              <p className="lp-lede">
                ClockAm never receives a picture or copy of anyone's fingerprint. The phone or laptop checks the finger and sends back a
                signed yes. We keep only a public key that can confirm that yes.
              </p>
            </div>
            <ul className="lp-points">
              <li><Icon name="shield" />If a phone is lost, an admin removes its fingerprint and the employee enrols again.</li>
              <li><Icon name="shield" />Employees see their own record. Managers and admins see their own workplace and nothing else.</li>
              <li><Icon name="shield" />The assistant can look things up and prepare changes, but a person has to confirm every change.</li>
            </ul>
          </div>
        </section>

        <section id="faq" className="lp-section" aria-labelledby="faq-title">
          <div className="lp-wrap lp-faq">
            <div className="lp-head">
              <h2 id="faq-title">Questions people ask</h2>
            </div>
            <div>
              {FAQ.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-cta" aria-labelledby="cta-title">
          <div className="lp-wrap">
            <h2 id="cta-title">Create your workplace and clock in your first employee today.</h2>
            <div className="lp-actions">
              <Link className="lp-btn big" to="/register">Create your workplace</Link>
              <Link className="lp-btn big ghost" to="/login">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter extra={<button type="button" className="lp-linkbtn" onClick={() => setSoon(true)}>Download the app</button>} />
      <ComingSoon open={soon} onClose={() => setSoon(false)} />
    </div>
  );
}
