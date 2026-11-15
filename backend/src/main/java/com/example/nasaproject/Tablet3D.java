package com.example.nasaproject;

import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.awt.geom.*;
import java.util.Arrays;
import java.util.Locale;

/**
 * First-person 3D view of a route, drawn as a tablet screen.
 * Uses the grid data and route of HexAStar. Opened from the HexAStar desktop viewer with V once a route exists.
 * Desktop tool only: the Spring server never creates it (it runs headless).
 */
public class Tablet3D extends JPanel {

    // ---------- settings ----------
    static final double FOV = Math.toRadians(68);          // field of view
    static final double BASE_PITCH = Math.toRadians(-15);  // camera tilted down
    static final Color FOG = new Color(226, 178, 135);     // haze/horizon colour
    static final Color SKY_TOP = new Color(118, 78, 66);   // sky top

    // ---------- data ----------
    HexAStar.Result res;
    int start, goal;
    int[] pth;
    double[] cum, cumCost;
    double total, totalCost, d0, view, near;
    double[] zn;                 // normalised height 0..1
    int[] topRGB;                // base colour of the top face
    int[][] wallNb;              // neighbour behind each side
    boolean[] onPath;
    boolean hasElev;
    int[] vis;
    double[] dist2;

    // ---------- camera state ----------
    double s = 0, yaw = 0, camX, camY, camZ;
    double yawOff = 0, pitchOff = 0, exag = 1.0, speed = 0.8;
    boolean playing = true;
    Point drag;
    javax.swing.Timer timer;

    // ---------- frame parameters ----------
    double vyaw, pitch, cyw, syw, cp, sp, focal, hcx, hcy;
    final double[] br = new double[16], bu = new double[16], bd = new double[16];
    final double[] cr = new double[16], cu = new double[16], cd = new double[16];
    final Path2D.Double path = new Path2D.Double();

    Tablet3D(HexAStar.Result r, int start, int goal) {
        this.res = r;
        this.start = start;
        this.goal = goal;
        int n = HexAStar.n;

        pth = r.path.stream().mapToInt(Integer::intValue).toArray();
        d0 = Math.sqrt(3.0) * HexAStar.HEX_EDGE;
        view = 18 * d0;
        near = 0.05 * HexAStar.HEX_EDGE;

        cum = new double[pth.length];
        cumCost = new double[pth.length];
        for (int k = 1; k < pth.length; k++) {
            int a = pth[k - 1], b = pth[k];
            cum[k] = cum[k - 1] + Math.hypot(HexAStar.cx[b] - HexAStar.cx[a], HexAStar.cy[b] - HexAStar.cy[a]);
            double c = HexAStar.edgeCost(a, b);
            cumCost[k] = cumCost[k - 1] + (Double.isInfinite(c) ? 0 : c);
        }
        total = Math.max(cum[pth.length - 1], 1e-6);
        totalCost = cumCost[pth.length - 1];

        onPath = new boolean[n];
        for (int i : pth) onPath[i] = true;

        // heights: real elevation (MOLA) or, without it, slope as a stand-in relief
        hasElev = false;
        for (int i = 0; i < n; i++) if (!Double.isNaN(HexAStar.elev[i])) { hasElev = true; break; }
        double[] raw = new double[n];
        double mn = 1e300, mx = -1e300, sum = 0;
        int cnt = 0;
        for (int i = 0; i < n; i++) {
            double v = hasElev ? HexAStar.elev[i] : HexAStar.slope[i];
            raw[i] = v;
            if (!Double.isNaN(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; cnt++; }
        }
        double mean = cnt > 0 ? sum / cnt : 0;
        if (cnt == 0) { mn = 0; mx = 1; }
        if (mx - mn < 1e-9) mx = mn + 1;
        zn = new double[n];
        for (int i = 0; i < n; i++) {
            if (Double.isNaN(raw[i])) raw[i] = mean;
            zn[i] = (raw[i] - mn) / (mx - mn);
        }

        // base colours of the top faces
        topRGB = new int[n];
        for (int i = 0; i < n; i++) {
            double sl = HexAStar.slope[i];
            Color c;
            if (Double.isNaN(sl)) {
                c = new Color(80, 80, 88);
            } else {
                c = marsRamp(zn[i]);
                double dk = 1 - 0.35 * clamp(sl / HexAStar.THETA_MAX, 0, 1);
                c = scale(c, dk);
                if (sl + HexAStar.K_SIGMA * HexAStar.sigma[i] > HexAStar.THETA_MAX)
                    c = mix(c, new Color(210, 50, 50), 0.45);        // hazardous cells
            }
            topRGB[i] = c.getRGB();
        }

        // neighbours behind the sides (for the side walls)
        wallNb = new int[n][];
        for (int i = 0; i < n; i++) {
            int m = HexAStar.px[i].length;
            wallNb[i] = new int[m];
            Arrays.fill(wallNb[i], -1);
            if (m != 6 || Double.isNaN(HexAStar.cx[i])) continue;
            for (int k = 0; k < m; k++) {
                int b = (k + 1) % m;
                double mxp = (HexAStar.px[i][k] + HexAStar.px[i][b]) / 2;
                double myp = (HexAStar.py[i][k] + HexAStar.py[i][b]) / 2;
                double tx = 2 * mxp - HexAStar.cx[i], ty = 2 * myp - HexAStar.cy[i];
                double best = 0.5 * HexAStar.HEX_EDGE;
                for (int j : HexAStar.neigh[i]) {
                    double d = Math.hypot(HexAStar.cx[j] - tx, HexAStar.cy[j] - ty);
                    if (d < best) { best = d; wallNb[i][k] = j; }
                }
            }
        }
        vis = new int[n];
        dist2 = new double[n];

        updateCamera(true);

        setPreferredSize(new Dimension(1320, 820));
        setFocusable(true);
        setBackground(Color.BLACK);

        addMouseListener(new MouseAdapter() {
            public void mousePressed(MouseEvent e) { drag = e.getPoint(); requestFocusInWindow(); }
        });
        addMouseMotionListener(new MouseMotionAdapter() {
            public void mouseDragged(MouseEvent e) {
                if (drag == null) return;
                yawOff = clamp(yawOff + (e.getX() - drag.x) * 0.005, -1.6, 1.6);
                pitchOff = clamp(pitchOff + (e.getY() - drag.y) * 0.003, -0.5, 0.5);
                drag = e.getPoint();
            }
        });
        addKeyListener(new KeyAdapter() {
            public void keyPressed(KeyEvent e) {
                switch (e.getKeyCode()) {
                    case KeyEvent.VK_SPACE:
                        if (s >= total - 1e-6) { s = 0; playing = true; } else playing = !playing;
                        break;
                    case KeyEvent.VK_LEFT:  s = Math.max(0, s - 0.5 * d0); break;
                    case KeyEvent.VK_RIGHT: s = Math.min(total, s + 0.5 * d0); break;
                    case KeyEvent.VK_UP:    speed = Math.min(6, speed * 1.25); break;
                    case KeyEvent.VK_DOWN:  speed = Math.max(0.1, speed / 1.25); break;
                    case KeyEvent.VK_Z:     exag = Math.min(5, exag * 1.25); break;
                    case KeyEvent.VK_X:     exag = Math.max(0.2, exag / 1.25); break;
                    case KeyEvent.VK_R:
                        s = 0; yawOff = 0; pitchOff = 0; playing = true; updateCamera(true);
                        break;
                    default:
                }
            }
        });

        timer = new javax.swing.Timer(33, e -> { tick(0.033); repaint(); });
        timer.start();
    }

    // =====================================================================
    //  Utilities
    // =====================================================================
    static double clamp(double x, double lo, double hi) { return Math.max(lo, Math.min(hi, x)); }

    static Color mix(Color a, Color b, double t) {
        t = clamp(t, 0, 1);
        return new Color((int) (a.getRed() + t * (b.getRed() - a.getRed())),
                         (int) (a.getGreen() + t * (b.getGreen() - a.getGreen())),
                         (int) (a.getBlue() + t * (b.getBlue() - a.getBlue())));
    }

    static Color scale(Color c, double f) {
        return new Color((int) clamp(c.getRed() * f, 0, 255),
                         (int) clamp(c.getGreen() * f, 0, 255),
                         (int) clamp(c.getBlue() * f, 0, 255));
    }

    static Color marsRamp(double t) {
        t = clamp(t, 0, 1);
        Color[] c = { new Color(70, 38, 32), new Color(150, 72, 42), new Color(205, 125, 75),
                      new Color(232, 180, 130), new Color(248, 226, 200) };
        double p = t * (c.length - 1);
        int i = Math.min((int) p, c.length - 2);
        return mix(c[i], c[i + 1], p - i);
    }

    static String fmtDist(double m) {
        return m >= 1000 ? String.format(Locale.US, "%.1f km", m / 1000.0)
                         : String.format(Locale.US, "%.0f m", m);
    }

    double relief() { return HexAStar.HEX_EDGE * 2.2 * exag; }

    // =====================================================================
    //  Moving along the route
    // =====================================================================
    int segIndex(double sv) {
        if (pth.length < 2) return 0;
        int k = Arrays.binarySearch(cum, sv);
        if (k < 0) k = -k - 2;
        return Math.max(0, Math.min(pth.length - 2, k));
    }

    double[] pos(double sv) {
        sv = clamp(sv, 0, total);
        if (pth.length < 2) {
            int a = pth[0];
            return new double[] { HexAStar.cx[a], HexAStar.cy[a], zn[a] * relief() };
        }
        int k = segIndex(sv);
        double seg = cum[k + 1] - cum[k];
        double t = seg > 1e-9 ? (sv - cum[k]) / seg : 0;
        int a = pth[k], b = pth[k + 1];
        return new double[] {
            HexAStar.cx[a] + t * (HexAStar.cx[b] - HexAStar.cx[a]),
            HexAStar.cy[a] + t * (HexAStar.cy[b] - HexAStar.cy[a]),
            (zn[a] + t * (zn[b] - zn[a])) * relief() };
    }

    double costAt(double sv) {
        sv = clamp(sv, 0, total);
        if (pth.length < 2) return 0;
        int k = segIndex(sv);
        double seg = cum[k + 1] - cum[k];
        double t = seg > 1e-9 ? (sv - cum[k]) / seg : 0;
        return cumCost[k] + t * (cumCost[k + 1] - cumCost[k]);
    }

    int curIdx() {
        if (pth.length < 2) return 0;
        int k = segIndex(s);
        double seg = cum[k + 1] - cum[k];
        double t = seg > 1e-9 ? (s - cum[k]) / seg : 0;
        return t > 0.5 ? k + 1 : k;
    }

    void updateCamera(boolean snap) {
        double[] p = pos(s);
        double[] q = pos(Math.min(total, s + 2.5 * d0));
        double tgt = Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6 ? Math.atan2(q[1] - p[1], q[0] - p[0]) : yaw;
        double eye = p[2] + HexAStar.HEX_EDGE * 0.9;
        if (snap) {
            yaw = tgt;
            camZ = eye;
        } else {
            double d = tgt - yaw;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            yaw += d * 0.12;
            camZ += (eye - camZ) * 0.2;
        }
        camX = p[0];
        camY = p[1];
    }

    void tick(double dt) {
        if (playing) {
            s += speed * d0 * dt;
            if (s >= total) { s = total; playing = false; }
        }
        updateCamera(false);
    }

    // =====================================================================
    //  3D projection
    // =====================================================================
    void setV(int idx, double x, double y, double z) {
        double dx = x - camX, dy = y - camY, du = z - camZ;
        double f = dx * cyw + dy * syw;
        br[idx] = dx * syw - dy * cyw;
        bd[idx] = f * cp + du * sp;
        bu[idx] = du * cp - f * sp;
    }

    void fillClipped(Graphics2D g, int m, Color col, boolean outline) {
        int k = 0;
        for (int a = 0; a < m; a++) {
            int b = (a + 1) % m;
            boolean ina = bd[a] >= near, inb = bd[b] >= near;
            if (ina) { cr[k] = br[a]; cu[k] = bu[a]; cd[k] = bd[a]; k++; }
            if (ina != inb) {
                double t = (near - bd[a]) / (bd[b] - bd[a]);
                cr[k] = br[a] + t * (br[b] - br[a]);
                cu[k] = bu[a] + t * (bu[b] - bu[a]);
                cd[k] = near;
                k++;
            }
        }
        if (k < 3) return;
        path.reset();
        for (int j = 0; j < k; j++) {
            double X = hcx + focal * cr[j] / cd[j], Y = hcy - focal * cu[j] / cd[j];
            if (j == 0) path.moveTo(X, Y); else path.lineTo(X, Y);
        }
        path.closePath();
        g.setColor(col);
        g.fill(path);
        if (outline) {
            g.setColor(new Color(0, 0, 0, 55));
            g.draw(path);
        }
    }

    // =====================================================================
    //  Drawing
    // =====================================================================
    @Override
    protected void paintComponent(Graphics g0) {
        super.paintComponent(g0);
        Graphics2D g = (Graphics2D) g0.create();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        int W = getWidth(), H = getHeight();

        g.setColor(new Color(14, 15, 18));
        g.fillRect(0, 0, W, H);

        // tablet body
        RoundRectangle2D body = new RoundRectangle2D.Double(6, 6, W - 12, H - 12, 56, 56);
        g.setColor(new Color(44, 46, 52));
        g.fill(body);
        g.setColor(new Color(78, 82, 90));
        g.setStroke(new BasicStroke(2f));
        g.draw(body);

        int bez = 26;
        int scrW = W - 2 * bez, scrH = H - 2 * bez;
        g.setColor(Color.BLACK);
        g.fill(new RoundRectangle2D.Double(bez, bez, scrW, scrH, 34, 34));
        g.setColor(new Color(24, 26, 30));
        g.fillOval(W / 2 - 5, 11, 10, 10);                      // front camera

        int sideW = 310;
        Rectangle vp = new Rectangle(bez + 10, bez + 10, scrW - sideW - 30, scrH - 20);
        renderViewport(g, vp);
        int sx = vp.x + vp.width + 10;
        renderSidebar(g, sx, vp.y, bez + scrW - 10 - sx, vp.height);
        g.dispose();
    }

    void renderViewport(Graphics2D g, Rectangle r) {
        Shape old = g.getClip();
        g.setClip(new RoundRectangle2D.Double(r.x, r.y, r.width, r.height, 24, 24));

        vyaw = yaw + yawOff;
        pitch = BASE_PITCH + pitchOff;
        cyw = Math.cos(vyaw); syw = Math.sin(vyaw);
        cp = Math.cos(pitch); sp = Math.sin(pitch);
        focal = (r.width / 2.0) / Math.tan(FOV / 2);
        hcx = r.x + r.width / 2.0;
        hcy = r.y + r.height / 2.0;
        double horizon = hcy + focal * Math.tan(pitch);

        // sky
        double hy = clamp(horizon, r.y, r.y + r.height);
        g.setPaint(new GradientPaint(0, r.y, SKY_TOP, 0, (float) Math.max(hy, r.y + 1), FOG));
        g.fillRect(r.x, r.y, r.width, (int) Math.ceil(hy - r.y));
        // ground below the horizon
        g.setPaint(new GradientPaint(0, (float) hy, FOG, 0, (float) Math.max(r.y + r.height, hy + 1), new Color(110, 64, 46)));
        g.fillRect(r.x, (int) hy, r.width, (int) Math.ceil(r.y + r.height - hy));

        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
        drawTerrain(g, r);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        drawRoute3D(g, r);
        drawBeacon(g, r);
        drawViewportHud(g, r);

        g.setClip(old);
        g.setColor(new Color(60, 64, 72));
        g.setStroke(new BasicStroke(1.5f));
        g.draw(new RoundRectangle2D.Double(r.x, r.y, r.width, r.height, 24, 24));
    }

    void drawTerrain(Graphics2D g, Rectangle r) {
        int n = HexAStar.n;
        double tanH = Math.tan(FOV / 2) * 1.3;
        double v2 = view * view;
        int vc = 0;
        for (int i = 0; i < n; i++) {
            if (Double.isNaN(HexAStar.cx[i])) continue;
            double dx = HexAStar.cx[i] - camX, dy = HexAStar.cy[i] - camY;
            double d2 = dx * dx + dy * dy;
            if (d2 > v2) continue;
            double f = dx * cyw + dy * syw;
            if (f < -d0) continue;
            double rr = dx * syw - dy * cyw;
            if (Math.abs(rr) > Math.max(f, 0) * tanH + 1.3 * d0) continue;
            vis[vc++] = i;
            dist2[i] = d2;
        }
        Integer[] order = new Integer[vc];
        for (int j = 0; j < vc; j++) order[j] = vis[j];
        Arrays.sort(order, (a, b) -> Double.compare(dist2[b], dist2[a]));    // far to near

        g.setStroke(new BasicStroke(1f));
        double relief = relief();
        for (int i : order) drawCell(g, i, relief);
    }

    void drawCell(Graphics2D g, int i, double relief) {
        double[] X = HexAStar.px[i], Y = HexAStar.py[i];
        int m = X.length;
        if (m < 3) return;
        double z = zn[i] * relief;
        double fogT = Math.min(1, Math.sqrt(dist2[i]) / view);
        fogT = fogT * fogT * 0.92;
        Color base = new Color(topRGB[i]);

        if (m == 6) {
            for (int k = 0; k < 6; k++) {
                int b = (k + 1) % 6;
                double mx = (X[k] + X[b]) / 2, my = (Y[k] + Y[b]) / 2;
                double nx = mx - HexAStar.cx[i], ny = my - HexAStar.cy[i];
                if (nx * (camX - mx) + ny * (camY - my) <= 0) continue;         // side faces away from the camera
                int nb = wallNb[i][k];
                double zb = nb >= 0 ? Math.min(zn[nb] * relief, z) : z - HexAStar.HEX_EDGE * 0.4;
                if (zb >= z - 1e-9) continue;
                setV(0, X[k], Y[k], z);
                setV(1, X[b], Y[b], z);
                setV(2, X[b], Y[b], zb);
                setV(3, X[k], Y[k], zb);
                double nl = Math.max(1e-9, Math.hypot(nx, ny));
                double lit = 0.5 + 0.35 * Math.max(0, (nx * -0.5 + ny * 0.8) / nl);
                fillClipped(g, 4, mix(scale(base, lit), FOG, fogT), false);
            }
        }
        Color top = base;
        if (onPath[i]) top = mix(base, new Color(255, 140, 20), 0.5);
        top = mix(top, FOG, fogT);
        for (int k = 0; k < m; k++) setV(k, X[k], Y[k], z);
        fillClipped(g, m, top, fogT < 0.5);
    }

    void drawRoute3D(Graphics2D g, Rectangle r) {
        int len = pth.length;
        if (len < 2) return;
        double relief = relief();
        double lift = HexAStar.HEX_EDGE * 0.08;
        double[][] seg = new double[len - 1][6];
        int cnt = 0;
        int kc = segIndex(s);
        for (int k = 0; k < len - 1; k++) {
            int a = pth[k], b = pth[k + 1];
            if (Math.hypot(HexAStar.cx[a] - camX, HexAStar.cy[a] - camY) > view) continue;
            setV(0, HexAStar.cx[a], HexAStar.cy[a], zn[a] * relief + lift);
            setV(1, HexAStar.cx[b], HexAStar.cy[b], zn[b] * relief + lift);
            double ra = br[0], ua = bu[0], da = bd[0], rb = br[1], ub = bu[1], db = bd[1];
            if (da < near && db < near) continue;
            if (da < near) {
                double t = (near - da) / (db - da);
                ra += t * (rb - ra); ua += t * (ub - ua); da = near;
            } else if (db < near) {
                double t = (near - db) / (da - db);
                rb += t * (ra - rb); ub += t * (ua - ub); db = near;
            }
            double[] q = seg[cnt++];
            q[0] = hcx + focal * ra / da; q[1] = hcy - focal * ua / da;
            q[2] = hcx + focal * rb / db; q[3] = hcy - focal * ub / db;
            q[4] = clamp(focal * HexAStar.HEX_EDGE * 0.10 / ((da + db) / 2), 2, 9);
            q[5] = k < kc ? 0 : 1;                                        // travelled part is dimmer
        }
        g.setStroke(new BasicStroke(1f));
        for (int pass = 0; pass < 2; pass++) {
            for (int j = 0; j < cnt; j++) {
                double[] q = seg[j];
                float w = (float) q[4];
                if (pass == 0) {
                    g.setStroke(new BasicStroke(w + 4, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
                    g.setColor(new Color(0, 0, 0, 120));
                } else {
                    g.setStroke(new BasicStroke(w, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
                    g.setColor(q[5] > 0 ? new Color(255, 150, 20) : new Color(255, 150, 20, 110));
                }
                g.draw(new Line2D.Double(q[0], q[1], q[2], q[3]));
            }
        }
    }

    void drawBeacon(Graphics2D g, Rectangle r) {
        int a = pth[pth.length - 1];
        double z0 = zn[a] * relief();
        setV(0, HexAStar.cx[a], HexAStar.cy[a], z0);
        setV(1, HexAStar.cx[a], HexAStar.cy[a], z0 + 2.5 * HexAStar.HEX_EDGE);
        if (bd[0] < near || bd[1] < near) return;
        double x0 = hcx + focal * br[0] / bd[0], y0 = hcy - focal * bu[0] / bd[0];
        double x1 = hcx + focal * br[1] / bd[1], y1 = hcy - focal * bu[1] / bd[1];
        g.setStroke(new BasicStroke(3f));
        g.setColor(new Color(60, 230, 255, 200));
        g.draw(new Line2D.Double(x0, y0, x1, y1));
        Path2D.Double dia = new Path2D.Double();
        dia.moveTo(x1, y1 - 12); dia.lineTo(x1 + 9, y1); dia.lineTo(x1, y1 + 12); dia.lineTo(x1 - 9, y1);
        dia.closePath();
        g.setColor(new Color(60, 230, 255));
        g.fill(dia);
        g.setFont(new Font("SansSerif", Font.BOLD, 13));
        g.setColor(Color.WHITE);
        g.drawString("GOAL " + HexAStar.ids[a] + "  " + fmtDist(total - s), (float) x1 + 14, (float) y1 + 4);
    }

    void drawViewportHud(Graphics2D g, Rectangle r) {
        // --- compass ---
        double hdg = ((90 - Math.toDegrees(vyaw)) % 360 + 360) % 360;
        int tw = 340, th = 34;
        int tx = r.x + r.width / 2 - tw / 2, ty = r.y + 12;
        g.setColor(new Color(10, 12, 16, 170));
        g.fill(new RoundRectangle2D.Double(tx, ty, tw, th, 14, 14));
        Shape c0 = g.getClip();
        g.clipRect(tx, ty, tw, th);
        double ppd = 4.0;
        g.setFont(new Font("SansSerif", Font.BOLD, 12));
        String[] names = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
        for (int d = (int) Math.floor(hdg) - 45; d <= (int) Math.floor(hdg) + 45; d++) {
            if (d % 5 != 0) continue;
            double x = tx + tw / 2.0 + (d - hdg) * ppd;
            int dn = ((d % 360) + 360) % 360;
            g.setColor(new Color(255, 255, 255, 200));
            if (dn % 45 == 0) {
                g.drawLine((int) x, ty + 6, (int) x, ty + 14);
                String lb = names[dn / 45];
                g.drawString(lb, (float) x - g.getFontMetrics().stringWidth(lb) / 2f, ty + 28);
            } else if (dn % 15 == 0) {
                g.drawLine((int) x, ty + 6, (int) x, ty + 12);
                String lb = String.valueOf(dn);
                g.setFont(new Font("SansSerif", Font.PLAIN, 10));
                g.drawString(lb, (float) x - g.getFontMetrics().stringWidth(lb) / 2f, ty + 26);
                g.setFont(new Font("SansSerif", Font.BOLD, 12));
            } else {
                g.drawLine((int) x, ty + 6, (int) x, ty + 9);
            }
        }
        g.setClip(c0);
        g.setColor(new Color(255, 170, 60));
        Path2D.Double mk = new Path2D.Double();
        mk.moveTo(tx + tw / 2.0, ty + 2); mk.lineTo(tx + tw / 2.0 - 5, ty - 4); mk.lineTo(tx + tw / 2.0 + 5, ty - 4);
        mk.closePath();
        g.fill(mk);

        // --- crosshair ---
        g.setColor(new Color(255, 255, 255, 120));
        g.setStroke(new BasicStroke(1.5f));
        g.draw(new Ellipse2D.Double(hcx - 9, hcy - 9, 18, 18));
        g.drawLine((int) hcx - 15, (int) hcy, (int) hcx - 9, (int) hcy);
        g.drawLine((int) hcx + 9, (int) hcy, (int) hcx + 15, (int) hcy);

        // --- corner labels ---
        g.setFont(new Font("SansSerif", Font.BOLD, 13));
        g.setColor(new Color(255, 255, 255, 220));
        g.drawString("First-person view", r.x + 18, r.y + 28);
        g.setFont(new Font("SansSerif", Font.PLAIN, 12));
        g.setColor(playing ? new Color(120, 230, 140) : new Color(255, 200, 90));
        g.drawString(playing ? "Moving" : "Paused", r.x + 18, r.y + 46);

        // --- warning about a steep stretch ahead ---
        int kc = curIdx();
        boolean warn = false;
        for (int k = kc; k <= Math.min(pth.length - 1, kc + 4); k++) {
            int c = pth[k];
            if (!Double.isNaN(HexAStar.slope[c])
                    && HexAStar.slope[c] + HexAStar.K_SIGMA * HexAStar.sigma[c] > 0.7 * HexAStar.THETA_MAX) warn = true;
        }
        if (warn) {
            g.setColor(new Color(200, 60, 40, 210));
            g.fill(new RoundRectangle2D.Double(r.x + r.width / 2.0 - 150, r.y + 56, 300, 28, 12, 12));
            g.setColor(Color.WHITE);
            g.setFont(new Font("SansSerif", Font.BOLD, 13));
            g.drawString("Steeper ground ahead", (float) (r.x + r.width / 2.0 - 133), r.y + 75);
        }

        // --- progress bar ---
        int bx = r.x + 20, by = r.y + r.height - 40, bw = r.width - 40;
        g.setColor(new Color(10, 12, 16, 170));
        g.fill(new RoundRectangle2D.Double(bx - 8, by - 20, bw + 16, 44, 14, 14));
        g.setColor(new Color(60, 64, 72));
        g.fill(new RoundRectangle2D.Double(bx, by, bw, 8, 8, 8));
        g.setColor(new Color(255, 150, 20));
        g.fill(new RoundRectangle2D.Double(bx, by, bw * (s / total), 8, 8, 8));
        g.setFont(new Font("SansSerif", Font.PLAIN, 12));
        g.setColor(Color.WHITE);
        g.drawString("Remaining: " + fmtDist(total - s) + "   ·   Travelled: " + fmtDist(s), bx, by - 6);
    }

    // =====================================================================
    //  Side panel: minimap and telemetry
    // =====================================================================
    void renderSidebar(Graphics2D g, int x, int y, int w, int h) {
        g.setColor(new Color(22, 25, 31));
        g.fill(new RoundRectangle2D.Double(x, y, w, h, 24, 24));
        g.setFont(new Font("SansSerif", Font.BOLD, 15));
        g.setColor(new Color(255, 170, 90));
        g.drawString("Mars EVA navigation", x + 16, y + 28);

        int ms = w - 32;
        drawMinimap(g, x + 16, y + 44, ms);

        int ry = y + 44 + ms + 28;
        int k = curIdx();
        int c = pth[k];
        row(g, "Cell", HexAStar.ids[c] + "  (" + (k + 1) + "/" + pth.length + ")", x, ry, w); ry += 26;
        row(g, "Elevation", hasElev ? String.format(Locale.US, "%.0f m", HexAStar.elev[c]) : "no data", x, ry, w); ry += 26;
        double sl = HexAStar.slope[c];
        row(g, "Slope", Double.isNaN(sl) ? "no data"
                : String.format(Locale.US, "%.1f° ± %.1f°", sl, HexAStar.sigma[c]), x, ry, w); ry += 26;
        String grade = "no data";
        if (hasElev && k + 2 < pth.length) {
            int a = pth[k], b = pth[k + 2];
            double dd = Math.hypot(HexAStar.cx[b] - HexAStar.cx[a], HexAStar.cy[b] - HexAStar.cy[a]);
            if (!Double.isNaN(HexAStar.elev[a]) && !Double.isNaN(HexAStar.elev[b]) && dd > 0)
                grade = String.format(Locale.US, "%+.1f°", Math.toDegrees(Math.atan((HexAStar.elev[b] - HexAStar.elev[a]) / dd)));
        }
        row(g, "Grade ahead", grade, x, ry, w); ry += 26;
        row(g, "Travelled", fmtDist(s), x, ry, w); ry += 26;
        row(g, "Remaining", fmtDist(total - s), x, ry, w); ry += 26;
        row(g, "Cost", String.format(Locale.US, "%.0f / %.0f", costAt(s), totalCost), x, ry, w); ry += 26;
        row(g, "Speed", String.format(Locale.US, "%.2f cells/s", speed), x, ry, w); ry += 26;
        row(g, "Relief scale", String.format(Locale.US, "×%.1f", exag), x, ry, w); ry += 30;

        if (!hasElev) {
            g.setFont(new Font("SansSerif", Font.PLAIN, 11));
            g.setColor(new Color(255, 190, 90));
            g.drawString("No elevation: relief is drawn from slope", x + 16, ry);
        }

        g.setFont(new Font("SansSerif", Font.PLAIN, 12));
        g.setColor(new Color(150, 156, 168));
        int hy = y + h - 96;
        g.drawString("Space: pause or play", x + 16, hy);
        g.drawString("Left/right: seek, up/down: speed", x + 16, hy + 18);
        g.drawString("Z / X: relief scale", x + 16, hy + 36);
        g.drawString("Drag: look around, R: restart", x + 16, hy + 54);
    }

    void row(Graphics2D g, String label, String val, int x, int y, int w) {
        g.setFont(new Font("SansSerif", Font.PLAIN, 13));
        g.setColor(new Color(150, 156, 168));
        g.drawString(label, x + 16, y);
        g.setFont(new Font("SansSerif", Font.BOLD, 13));
        g.setColor(Color.WHITE);
        g.drawString(val, x + w - 16 - g.getFontMetrics().stringWidth(val), y);
    }

    void drawMinimap(Graphics2D g, int mx, int my, int ms) {
        Shape old = g.getClip();
        g.setClip(new RoundRectangle2D.Double(mx, my, ms, ms, 18, 18));
        g.setColor(new Color(10, 12, 16));
        g.fillRect(mx, my, ms, ms);

        double R = 11 * d0, sc = (ms / 2.0) / R;
        double mcx = mx + ms / 2.0, mcy = my + ms / 2.0;
        int n = HexAStar.n;
        Path2D.Double poly = new Path2D.Double();
        for (int i = 0; i < n; i++) {
            if (Double.isNaN(HexAStar.cx[i])) continue;
            double dx = HexAStar.cx[i] - camX, dy = HexAStar.cy[i] - camY;
            if (dx * dx + dy * dy > R * R * 2.6) continue;
            poly.reset();
            double[] X = HexAStar.px[i], Y = HexAStar.py[i];
            for (int k = 0; k < X.length; k++) {
                double vx = X[k] - camX, vy = Y[k] - camY;
                double rr = vx * syw - vy * cyw, ff = vx * cyw + vy * syw;
                double sxp = mcx + rr * sc, syp = mcy - ff * sc;
                if (k == 0) poly.moveTo(sxp, syp); else poly.lineTo(sxp, syp);
            }
            poly.closePath();
            g.setColor(new Color(topRGB[i]));
            g.fill(poly);
        }

        // route
        Path2D.Double line = new Path2D.Double();
        for (int k = 0; k < pth.length; k++) {
            double vx = HexAStar.cx[pth[k]] - camX, vy = HexAStar.cy[pth[k]] - camY;
            double sxp = mcx + (vx * syw - vy * cyw) * sc, syp = mcy - (vx * cyw + vy * syw) * sc;
            if (k == 0) line.moveTo(sxp, syp); else line.lineTo(sxp, syp);
        }
        g.setStroke(new BasicStroke(3f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.setColor(new Color(255, 150, 20));
        g.draw(line);

        // start and goal
        int[] pts = { pth[0], pth[pth.length - 1] };
        Color[] cols = { new Color(80, 230, 100), new Color(60, 230, 255) };
        for (int j = 0; j < 2; j++) {
            double vx = HexAStar.cx[pts[j]] - camX, vy = HexAStar.cy[pts[j]] - camY;
            double sxp = mcx + (vx * syw - vy * cyw) * sc, syp = mcy - (vx * cyw + vy * syw) * sc;
            g.setColor(cols[j]);
            g.fill(new Ellipse2D.Double(sxp - 5, syp - 5, 10, 10));
        }

        // view cone and camera arrow
        double hf = FOV / 2, L = ms * 0.5;
        Path2D.Double wedge = new Path2D.Double();
        wedge.moveTo(mcx, mcy);
        wedge.lineTo(mcx - Math.sin(hf) * L, mcy - Math.cos(hf) * L);
        wedge.lineTo(mcx + Math.sin(hf) * L, mcy - Math.cos(hf) * L);
        wedge.closePath();
        g.setColor(new Color(255, 255, 255, 40));
        g.fill(wedge);
        Path2D.Double ar = new Path2D.Double();
        ar.moveTo(mcx, mcy - 10); ar.lineTo(mcx - 6, mcy + 7); ar.lineTo(mcx + 6, mcy + 7);
        ar.closePath();
        g.setColor(Color.WHITE);
        g.fill(ar);

        g.setClip(old);
        g.setColor(new Color(60, 64, 72));
        g.setStroke(new BasicStroke(1.5f));
        g.draw(new RoundRectangle2D.Double(mx, my, ms, ms, 18, 18));
    }

    // =====================================================================
    //  Opening the window
    // =====================================================================
    static void show(HexAStar.Result r, int start, int goal) {
        SwingUtilities.invokeLater(() -> {
            JFrame f = new JFrame("Mars EVA, 3D tablet");
            f.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
            Tablet3D t = new Tablet3D(r, start, goal);
            f.addWindowListener(new WindowAdapter() {
                public void windowClosed(WindowEvent e) { t.timer.stop(); }
            });
            f.add(t);
            f.pack();
            f.setLocationRelativeTo(null);
            f.setVisible(true);
            t.requestFocusInWindow();
        });
    }
}
