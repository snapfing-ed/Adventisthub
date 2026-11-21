import './globals.css';

export const metadata = {
  title: 'AdventistHub — Multi-Tenant Church & PCM Management',
  description:
    'Seventh-day Adventist Church Manual & Public Campus Ministries governance platform.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
