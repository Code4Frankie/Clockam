export default function Logo({ size = 120 }) {
  return <img src="/logo.png" alt="ClockAm" width={size} height={size} style={{ objectFit: 'contain' }} />;
}
