export default function NotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: '#0f172a',
        }}
      >
        <h1 style={{ fontSize: '4rem', fontWeight: 700, margin: 0 }}>404</h1>
        <p style={{ color: '#64748b', marginTop: '1rem' }}>الصفحة غير موجودة</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          style={{
            marginTop: '1.5rem',
            color: '#354FD8',
            textDecoration: 'underline',
          }}
        >
          العودة للرئيسية
        </a>
      </body>
    </html>
  );
}
