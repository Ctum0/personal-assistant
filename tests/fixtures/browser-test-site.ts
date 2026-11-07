import http from 'node:http';

export interface TestSiteInstance {
  server: http.Server;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startBrowserTestSite(): Promise<TestSiteInstance> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Sofia Test Home</title></head>
          <body>
            <h1>Welcome to Sofia Test Portal</h1>
            <p id="counter">Count: 0</p>
            <button id="counter-btn" onclick="const c = document.getElementById('counter'); const n = parseInt(c.innerText.split(': ')[1]) + 1; c.innerText = 'Count: ' + n;">Increment</button>
            <br/><br/>
            <input type="text" id="note-input" placeholder="Type a note here..." />
            <br/><br/>
            <a id="link-page2" href="/page2">Go to Page 2</a>
            <div style="height: 2000px; padding-top: 1500px;" id="bottom-marker">Bottom of Page</div>
          </body>
        </html>
      `);
      return;
    }

    if (url.pathname === '/page2') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Page Two - Documentation</title></head>
          <body>
            <h1>Documentation Page</h1>
            <p id="page2-content">Detailed system documentation content for agent verification.</p>
            <a id="link-home" href="/">Back Home</a>
          </body>
        </html>
      `);
      return;
    }

    if (url.pathname === '/login') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Login Page</title></head>
          <body>
            <h1>Account Login</h1>
            <form action="/login-submit" method="POST">
              <label>Username: <input type="text" id="username" name="username" /></label>
              <label>Password: <input type="password" id="password" name="password" autocomplete="current-password" /></label>
              <button type="submit" id="login-btn">Log In</button>
            </form>
          </body>
        </html>
      `);
      return;
    }

    if (url.pathname === '/checkout') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Checkout Page</title></head>
          <body>
            <h1>Checkout</h1>
            <p>Order Total: $49.99</p>
            <button id="pay-btn" role="submit">Confirm Payment</button>
          </body>
        </html>
      `);
      return;
    }

    if (url.pathname === '/delete-account') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Settings - Danger Zone</title></head>
          <body>
            <h1>Danger Zone</h1>
            <button id="delete-btn" aria-label="delete-account">Permanently Delete Account</button>
          </body>
        </html>
      `);
      return;
    }

    if (url.pathname === '/redirect-internal') {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
      return;
    }

    if (url.pathname === '/script-ssrf') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Script SSRF Test</title></head>
          <body>
            <script>
              fetch('http://10.0.0.1/admin').catch(err => {
                document.body.setAttribute('data-fetch-status', 'blocked');
              });
            </script>
          </body>
        </html>
      `);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return new Promise((resolve, reject) => {
    // Listen on 127.0.0.1 with port 0 for random free port
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      const port = address.port;
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: async () => {
          return new Promise<void>((res) => server.close(() => res()));
        },
      });
    });

    server.on('error', reject);
  });
}
