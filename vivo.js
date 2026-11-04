// La parte viva de la web: la página es un disco que se copia y el puntero es
// el cabezal que lo lee. Sin este script se lee entera, con el nombre como
// texto, las capturas quietas y los pasos como una lista. Con «reducir
// movimiento» todo queda ya leído, sin estela ni ondas.
(() => {
  const raiz = document.documentElement;
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const raton = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
  // Un azar con semilla: los mismos sectores fallan en cada visita.
  const azar = (i, j) => {
    const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };

  // Los colores salen de la hoja de estilos, así siguen al tema.
  const NOMBRES = ["fondo", "sector", "leido", "losa", "sobrelosa", "error", "cabezal"];
  let color = {};
  const leerColores = () => {
    const estilo = getComputedStyle(raiz);
    color = Object.fromEntries(NOMBRES.map((n) => [n, estilo.getPropertyValue("--" + n).trim()]));
  };
  leerColores();
  const alCambiarTema = [];
  const temaCambiado = () => {
    leerColores();
    for (const f of alCambiarTema) f();
  };
  new MutationObserver(temaCambiado).observe(raiz, { attributes: true, attributeFilter: ["data-tema"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", temaCambiado);

  // Pinta una celda con el hueco de 1px arriba y a la izquierda, como la
  // retícula de fondo de la página.
  const celda = (ctx, x, y, s) => ctx.rect(x + 1, y + 1, s - 1, s - 1);

  // 1. El disco de la portada. El nombre sale de los sectores leídos, dentro
  // de una losa; el puntero es el cabezal y deja un rastro; un toque lanza
  // una relectura en onda.
  const portada = document.querySelector(".portada");
  const nombre = document.getElementById("nombre");
  const disco = document.querySelector("canvas.disco");
  let lado = 8;

  const montarDisco = () => {
    const ctx = disco.getContext("2d");
    const base = document.createElement("canvas");
    const bctx = base.getContext("2d");
    // Tipo de cada sector: 0 disco, 1 losa, 2 letra. Y si falla al leerse.
    // Las letras se dibujan con sectores FINO veces más pequeños, en `letra`:
    // con los del disco el nombre no se lee bien.
    const FINO = 3;
    let W = 0, H = 0, tipo, falla, letra, ppp = 1, losa = [0, 0, 0, 0];
    let leido = quieto ? 1 : 0;
    const rastro = new Map();
    const ondas = [];
    let visible = true;

    const medir = () => {
      const tam = parseFloat(getComputedStyle(nombre).fontSize);
      lado = Math.max(4, Math.round(tam / 17));
      raiz.style.setProperty("--s", lado + "px");
      const ancho = raiz.clientWidth;
      const alto = portada.getBoundingClientRect().bottom + scrollY;
      W = Math.ceil(ancho / lado);
      H = Math.ceil(alto / lado);
      ppp = Math.min(devicePixelRatio || 1, 2);
      for (const c of [disco, base]) {
        c.width = W * lado * ppp;
        c.height = H * lado * ppp;
      }
      disco.style.width = base.style.width = W * lado + "px";
      disco.style.height = H * lado + "px";

      // La máscara del nombre: cada palabra donde la pone el navegador, a la
      // resolución de los sectores finos.
      const fino = lado / FINO;
      const m = document.createElement("canvas");
      m.width = W * FINO;
      m.height = H * FINO;
      const mc = m.getContext("2d", { willReadFrequently: true });
      mc.fillStyle = "#000";
      mc.textBaseline = "alphabetic";
      const fuente = getComputedStyle(nombre);
      mc.font = `${fuente.fontWeight} ${tam / fino}px ${fuente.fontFamily}`;
      if ("letterSpacing" in mc) mc.letterSpacing = parseFloat(fuente.letterSpacing || 0) / fino + "px";
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      const rango = document.createRange();
      const caminar = document.createTreeWalker(nombre, NodeFilter.SHOW_TEXT);
      for (let n = caminar.nextNode(); n; n = caminar.nextNode()) {
        for (const p of n.data.matchAll(/\S+/g)) {
          rango.setStart(n, p.index);
          rango.setEnd(n, p.index + p[0].length);
          const r = rango.getBoundingClientRect();
          const medida = mc.measureText(p[0]);
          const x = (r.left + scrollX) / fino;
          const y = (r.top + scrollY) / fino + medida.fontBoundingBoxAscent;
          mc.save();
          mc.translate(x, 0);
          mc.scale(r.width / fino / Math.max(medida.width, 1), 1);
          mc.fillText(p[0], 0, y);
          mc.restore();
          x0 = Math.min(x0, r.left + scrollX);
          y0 = Math.min(y0, r.top + scrollY);
          x1 = Math.max(x1, r.right + scrollX);
          y1 = Math.max(y1, r.bottom + scrollY);
        }
      }
      const d = mc.getImageData(0, 0, m.width, m.height).data;
      letra = new Uint8Array(m.width * m.height);
      for (let k = 0; k < letra.length; k++) letra[k] = d[k * 4 + 3] > 110 ? 1 : 0;
      const margen = 2;
      const [cx0, cy0] = [Math.floor(x0 / lado) - margen, Math.floor(y0 / lado) - margen];
      const [cx1, cy1] = [Math.ceil(x1 / lado) + margen, Math.ceil(y1 / lado) + margen];
      losa = [cx0, cy0, cx1, cy1];
      tipo = new Uint8Array(W * H);
      falla = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const k = j * W + i;
          const enLosa = i >= cx0 && i < cx1 && j >= cy0 && j < cy1;
          let tinta = 0;
          for (let b = 0; b < FINO; b++)
            for (let a = 0; a < FINO; a++) tinta += letra[(j * FINO + b) * m.width + i * FINO + a];
          tipo[k] = tinta ? 2 : enLosa ? 1 : 0;
          // En la losa no falla nada: los fallos junto a las letras las ensucian.
          falla[k] = !enLosa && tipo[k] === 0 && azar(i, j) < 0.0012 ? 1 : 0;
        }
      }
    };

    // El color de un sector, leído o no.
    const tono = (k, esLeido) => {
      if (!esLeido) return color.sector;
      if (falla[k]) return color.error;
      return tipo[k] ? color.losa : color.leido;
    };
    // El cabezal invierte lo que lee: sobre la losa, oscuro; sobre la letra,
    // claro; sobre el disco, el color del cabezal.
    const tonoCabezal = (k) => (tipo[k] === 2 ? color.losa : tipo[k] === 1 ? color.sobrelosa : color.cabezal);

    // Dibuja el estado de la copia en el lienzo de base: agrupa los sectores
    // por color para no cambiar de pincel en cada uno.
    const pintarBase = () => {
      bctx.setTransform(ppp, 0, 0, ppp, 0, 0);
      bctx.fillStyle = color.fondo;
      bctx.fillRect(0, 0, W * lado, H * lado);
      const N = W * H;
      const frente = leido * N;
      const grupos = new Map();
      for (let k = 0; k < N; k++) {
        const t = k < frente ? (k > frente - W * 1.5 ? color.cabezal : tono(k, true)) : color.sector;
        let g = grupos.get(t);
        if (!g) grupos.set(t, (g = []));
        g.push(k);
      }
      // En la losa los sectores van pegados y la junta se marca apenas: si no,
      // la retícula pesa más que el nombre.
      const pegado = (t) => t === color.losa || t === color.sobrelosa;
      for (const [t, lista] of grupos) {
        bctx.fillStyle = t;
        bctx.beginPath();
        for (const k of lista) {
          const x = (k % W) * lado, y = Math.floor(k / W) * lado;
          if (pegado(t)) bctx.rect(x, y, lado, lado);
          else celda(bctx, x, y, lado);
        }
        bctx.fill();
      }
      const [x0, y0, x1, y1] = losa;
      const hasta = Math.min(y1, Math.floor(frente / W));
      if (hasta > y0) {
        // Las letras, en sectores finos y pegados.
        bctx.fillStyle = color.sobrelosa;
        bctx.beginPath();
        const fw = W * FINO, f = lado / FINO;
        for (let fj = Math.max(0, y0) * FINO; fj < Math.min(hasta, H) * FINO; fj++)
          for (let fi = Math.max(0, x0) * FINO; fi < Math.min(x1, W) * FINO; fi++)
            if (letra[fj * fw + fi]) bctx.rect(fi * f, fj * f, f, f);
        bctx.fill();
        bctx.globalAlpha = 0.07;
        bctx.fillStyle = color.fondo;
        bctx.beginPath();
        for (let i = x0; i <= x1; i++) bctx.rect(i * lado, y0 * lado, 1, (hasta - y0) * lado);
        for (let j = y0; j <= hasta; j++) bctx.rect(x0 * lado, j * lado, (x1 - x0) * lado, 1);
        bctx.fill();
        bctx.globalAlpha = 1;
      }
    };

    const pintar = (ahora) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(ppp, 0, 0, ppp, 0, 0);
      for (const [k, t] of rastro) {
        const vida = 1 - (ahora - t.desde) / t.dura;
        if (vida <= 0) {
          rastro.delete(k);
          continue;
        }
        ctx.globalAlpha = vida * t.fuerza;
        ctx.fillStyle = tonoCabezal(k);
        ctx.beginPath();
        celda(ctx, (k % W) * lado, Math.floor(k / W) * lado, lado);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const tocar = (i, j, ahora, dura, fuerza) => {
      if (i < 0 || j < 0 || i >= W || j >= H) return;
      rastro.set(j * W + i, { desde: ahora, dura, fuerza });
    };

    // Bucle: corre solo mientras hay algo que mover y la portada se ve.
    let pedido = false;
    const bucle = (ahora) => {
      pedido = false;
      if (leido < 1) {
        leido = limitar((ahora - inicio) / 1700, 0, 1);
        pintarBase();
        if (leido === 1) terminado();
      }
      for (let n = ondas.length - 1; n >= 0; n--) {
        const o = ondas[n];
        const r = (ahora - o.desde) / 18;
        if (r > o.hasta) {
          ondas.splice(n, 1);
          continue;
        }
        const pasos = Math.ceil(r * 6.3);
        for (let a = 0; a < pasos; a++) {
          const ang = (a / pasos) * Math.PI * 2;
          tocar(Math.round(o.i + Math.cos(ang) * r), Math.round(o.j + Math.sin(ang) * r), ahora, 520, 0.9);
        }
      }
      pintar(ahora);
      if (visible && (leido < 1 || rastro.size || ondas.length)) pedir();
    };
    const pedir = () => {
      if (!pedido) {
        pedido = true;
        requestAnimationFrame(bucle);
      }
    };

    const reconstruir = () => {
      medir();
      pintarBase();
      pintar(performance.now());
    };

    medir();
    pintarBase();
    pintar(0);
    disco.hidden = false;
    raiz.classList.add("con-disco");
    const inicio = performance.now() + 250;
    // Lo que espera a que acabe la copia: el marcador, el campo…
    let alTerminar = [];
    const terminado = () => {
      for (const f of alTerminar) f();
      alTerminar = [];
    };
    if (!quieto) pedir();

    let espera;
    addEventListener("resize", () => {
      clearTimeout(espera);
      espera = setTimeout(reconstruir, 150);
    });
    alCambiarTema.push(reconstruir);
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) pedir();
    }).observe(portada);

    if (!quieto) {
      const celdaDe = (e) => [Math.floor((e.clientX + scrollX) / lado), Math.floor((e.clientY + scrollY) / lado)];
      if (raton) {
        addEventListener("pointermove", (e) => {
          if (!visible) return;
          const [i, j] = celdaDe(e);
          if (j >= H) return;
          const ahora = performance.now();
          for (let dj = -2; dj <= 2; dj++)
            for (let di = -2; di <= 2; di++)
              if (di * di + dj * dj <= 5) tocar(i + di, j + dj, ahora, 650, di || dj ? 0.7 : 1);
          pedir();
        }, { passive: true });
      }
      portada.addEventListener("pointerdown", (e) => {
        if (e.target.closest("a, button")) return;
        const [i, j] = celdaDe(e);
        ondas.push({ i, j, desde: performance.now(), hasta: Math.max(W, H) * 0.35 });
        pedir();
      });
      // Alguna relectura suelta al poco de tocar la página: el disco sigue
      // vivo un rato y luego se queda quieto, para no distraer al leer.
      let ultimo = performance.now();
      for (const ev of ["pointermove", "pointerdown", "scroll", "keydown"]) {
        addEventListener(ev, () => (ultimo = performance.now()), { passive: true });
      }
      setInterval(() => {
        if (!visible || document.hidden || performance.now() - ultimo > 4000) return;
        const ahora = performance.now();
        const j0 = Math.floor(scrollY / lado);
        const filas = Math.ceil(innerHeight / lado);
        for (let n = 0; n < 3; n++) {
          tocar(Math.floor(Math.random() * W), j0 + Math.floor(Math.random() * filas), ahora, 900, 0.8);
        }
        pedir();
      }, 140);
    }

    return (f) => {
      if (leido === 1) f();
      else alTerminar.push(f);
    };
  };

  let alCopiar = (f) => f();
  if (portada && nombre && disco && disco.getContext) {
    // Se mide con la fuente ya cargada, si no las letras no caen en su sitio.
    const listo = document.fonts ? document.fonts.ready : Promise.resolve();
    let pendientes = [];
    alCopiar = (f) => pendientes.push(f);
    listo.then(() => {
      const cuandoCopie = montarDisco();
      cuandoCopie(() => {
        for (const f of pendientes) f();
        pendientes = [];
      });
      alCopiar = (f) => cuandoCopie(f);
    });
  }

  // 2. El campo: el resto de la página también es disco. Un lienzo fijo,
  // detrás del texto, pinta los sectores que se ven. Cada fila se lee la
  // primera vez que entra en pantalla, de arriba abajo; el puntero deja su
  // estela y un toque lanza una onda, igual que en la portada.
  const montarCampo = () => {
    const lienzo = document.createElement("canvas");
    lienzo.className = "campo";
    lienzo.setAttribute("aria-hidden", "true");
    document.body.prepend(lienzo);
    const ctx = lienzo.getContext("2d");
    let s = 8, W = 0, ppp = 1, desde = 0, ancho = 0, alto = 0;
    // El momento en que empieza a leerse cada fila del documento.
    let filas = new Float64Array(0);
    let ruido = null, roto = null;
    const rastro = new Map();
    const ondas = [];
    let empezar = false;
    const RETRASO = 60;
    // Fuera de la portada el disco se lee en calma: sin franja de cabezal ni
    // fallos, para no competir con el texto. Solo la página de error tiene el
    // disco dañado.
    const tasaFallos = document.querySelector("main > .error") ? 0.015 : 0;

    const medir = () => {
      s = parseFloat(getComputedStyle(raiz).getPropertyValue("--s")) || 8;
      ppp = Math.min(devicePixelRatio || 1, 2);
      ancho = raiz.clientWidth;
      alto = innerHeight;
      W = Math.ceil(ancho / s);
      lienzo.width = ancho * ppp;
      lienzo.height = alto * ppp;
      lienzo.style.width = ancho + "px";
      lienzo.style.height = alto + "px";
      const total = Math.ceil(raiz.scrollHeight / s) + 2;
      if (total !== filas.length) {
        const nuevas = new Float64Array(total).fill(quieto ? -Infinity : Infinity);
        nuevas.set(filas.subarray(0, Math.min(total, filas.length)));
        filas = nuevas;
      }
      // La portada tiene su propio disco.
      desde = portada ? Math.ceil((portada.getBoundingClientRect().bottom + scrollY) / s) : 0;
      // El desorden de cada sector se calcula una vez: al bajar solo se lee.
      const N = W * filas.length;
      if (!ruido || ruido.length !== N) {
        ruido = new Float32Array(N);
        roto = new Uint8Array(N);
        for (let j = 0, k = 0; j < filas.length; j++)
          for (let i = 0; i < W; i++, k++) {
            ruido[k] = azar(i, j) * RETRASO;
            roto[k] = azar(j + 7, i * 3) < tasaFallos ? 1 : 0;
          }
      }
    };

    // Las filas que se ven y aún no se han leído entran en cola, de arriba
    // abajo, a 9 ms por fila: se aclaran como un fundido, no una espera.
    const programar = (ahora) => {
      if (!empezar || quieto) return;
      const j0 = Math.max(desde, Math.floor(scrollY / s));
      const j1 = Math.min(filas.length - 1, Math.ceil((scrollY + alto * 0.95) / s));
      let n = 0;
      for (let j = j0; j <= j1; j++) if (filas[j] === Infinity) filas[j] = ahora + n++ * 9;
      if (n) pedir();
    };

    const pintar = (ahora) => {
      ctx.setTransform(ppp, 0, 0, ppp, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
      const j0 = Math.max(desde, Math.floor(scrollY / s));
      const j1 = Math.min(filas.length - 1, Math.ceil((scrollY + alto) / s));
      const leidos = [], fallos = [];
      let falta = false;
      for (let j = j0; j <= j1; j++) {
        const t0 = filas[j];
        if (t0 === Infinity) continue;
        for (let i = 0, k = j * W; i < W; i++, k++) {
          const t = t0 + ruido[k];
          if (ahora < t) falta = true;
          else (roto[k] ? fallos : leidos).push(i, j);
        }
      }
      const y0 = -scrollY;
      for (const [c, lista] of [[color.leido, leidos], [color.error, fallos]]) {
        ctx.fillStyle = c;
        ctx.beginPath();
        for (let n = 0; n < lista.length; n += 2) celda(ctx, lista[n] * s, y0 + lista[n + 1] * s, s);
        ctx.fill();
      }
      ctx.fillStyle = color.cabezal;
      for (const [k, t] of rastro) {
        const vida = 1 - (ahora - t.desde) / t.dura;
        if (vida <= 0) {
          rastro.delete(k);
          continue;
        }
        const j = Math.floor(k / W);
        if (j < j0 || j > j1) continue;
        ctx.globalAlpha = vida * t.fuerza;
        ctx.beginPath();
        celda(ctx, (k % W) * s, y0 + j * s, s);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return falta;
    };

    const tocar = (i, j, ahora, dura, fuerza) => {
      if (i < 0 || i >= W || j < desde || j >= filas.length) return;
      rastro.set(j * W + i, { desde: ahora, dura, fuerza });
    };

    let pedido = false;
    const bucle = (ahora) => {
      pedido = false;
      for (let n = ondas.length - 1; n >= 0; n--) {
        const o = ondas[n];
        const r = (ahora - o.desde) / 18;
        if (r > o.hasta) {
          ondas.splice(n, 1);
          continue;
        }
        const pasos = Math.ceil(r * 6.3);
        for (let a = 0; a < pasos; a++) {
          const ang = (a / pasos) * Math.PI * 2;
          tocar(Math.round(o.i + Math.cos(ang) * r), Math.round(o.j + Math.sin(ang) * r), ahora, 420, 0.35);
        }
      }
      const falta = pintar(ahora);
      if (falta || rastro.size || ondas.length) pedir();
    };
    const pedir = () => {
      if (!pedido) {
        pedido = true;
        requestAnimationFrame(bucle);
      }
    };

    medir();
    lienzo.hidden = false;
    raiz.classList.add("con-campo");
    alCopiar(() => {
      empezar = true;
      programar(performance.now());
    });
    let espera;
    const remedir = () => {
      clearTimeout(espera);
      // Después del disco de la portada (150 ms), que es quien fija --s.
      espera = setTimeout(() => {
        medir();
        programar(performance.now());
        pedir();
      }, 220);
    };
    addEventListener("resize", remedir);
    new ResizeObserver(remedir).observe(document.body);
    alCambiarTema.push(pedir);

    if (!quieto) {
      const celdaDe = (e) => [Math.floor((e.clientX + scrollX) / s), Math.floor((e.clientY + scrollY) / s)];
      if (raton) {
        addEventListener("pointermove", (e) => {
          const [i, j] = celdaDe(e);
          if (j < desde) return;
          const ahora = performance.now();
          // Fuera de la portada la estela es un solo sector, tenue: la mira
          // ya dice dónde está el puntero.
          tocar(i, j, ahora, 450, 0.3);
          pedir();
        }, { passive: true });
      }
      addEventListener("pointerdown", (e) => {
        if (e.target.closest("a, button, .portada, .marcador")) return;
        const [i, j] = celdaDe(e);
        if (j < desde) return;
        ondas.push({ i, j, desde: performance.now(), hasta: Math.max(W, alto / s) * 0.15 });
        pedir();
      });
    }

    // Al bajar: repintar y meter en cola las filas nuevas.
    return () => {
      programar(performance.now());
      pintar(performance.now());
    };
  };

  // 3. La mira: con ratón, el cabezal sustituye al puntero. Va de sector en
  // sector y, sobre algo que se pulsa, lo encuadra con sus cuatro esquinas.
  const montarMira = () => {
    const mira = document.createElement("div");
    mira.className = "mira";
    mira.setAttribute("aria-hidden", "true");
    document.body.append(mira);
    raiz.classList.add("con-mira");
    const PULSABLE = "a[href], button, summary, label, [role='button']";
    let x = -100, y = -100, objetivo = null;
    const colocar = () => {
      const s = parseFloat(getComputedStyle(raiz).getPropertyValue("--s")) || 8;
      if (objetivo && objetivo.isConnected) {
        const r = objetivo.getBoundingClientRect();
        const m = Math.max(4, s * 0.75);
        mira.classList.add("fijada");
        mira.style.transform = `translate(${r.left - m}px, ${r.top - m}px)`;
        mira.style.width = r.width + 2 * m + "px";
        mira.style.height = r.height + 2 * m + "px";
      } else {
        // La mira libre ocupa tres sectores alrededor del que está debajo.
        const i = Math.floor((x + scrollX) / s), j = Math.floor((y + scrollY) / s);
        mira.classList.remove("fijada");
        mira.style.transform = `translate(${(i - 1) * s - scrollX}px, ${(j - 1) * s - scrollY}px)`;
        mira.style.width = mira.style.height = 3 * s + "px";
      }
    };
    let pendiente = false;
    const pedir = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        colocar();
      });
    };
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      objetivo = e.target.closest ? e.target.closest(PULSABLE) : null;
      mira.classList.add("vista");
      pedir();
    }, { passive: true });
    addEventListener("scroll", pedir, { passive: true });
    document.addEventListener("pointerleave", () => mira.classList.remove("vista"));
    raiz.addEventListener("pointerleave", () => mira.classList.remove("vista"));
    addEventListener("blur", () => mira.classList.remove("vista"));
    addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      mira.classList.remove("pulsa");
      void mira.offsetWidth;
      mira.classList.add("pulsa");
    });
    addEventListener("pointerup", () => mira.classList.remove("pulsa"));
  };
  if (raton) montarMira();

  // 4. Una captura se lee como el disco: los sectores que faltan la tapan y
  // se van quitando fila a fila.
  const leerCaptura = (caja) => {
    if (quieto) return;
    let lienzo = caja.querySelector(":scope > canvas.lectura");
    if (!lienzo) {
      lienzo = document.createElement("canvas");
      lienzo.className = "lectura";
      lienzo.setAttribute("aria-hidden", "true");
      caja.append(lienzo);
    }
    const r = caja.getBoundingClientRect();
    if (!r.width) return;
    const s = Math.max(10, lado * 2);
    const W = Math.ceil(r.width / s), H = Math.ceil(r.height / s);
    const ppp = Math.min(devicePixelRatio || 1, 2);
    lienzo.width = W * s * ppp;
    lienzo.height = H * s * ppp;
    const ctx = lienzo.getContext("2d");
    ctx.setTransform(ppp, 0, 0, ppp, 0, 0);
    const desde = performance.now();
    const dura = 600;
    const N = W * H;
    // Cada sector se lee en su turno, con un poco de desorden por fila.
    const turno = new Float32Array(N);
    for (let k = 0; k < N; k++) turno[k] = (Math.floor(k / W) + azar(k % W, k) * 1.6) / (H + 1.6);
    const paso = (ahora) => {
      const t = limitar((ahora - desde) / dura, 0, 1);
      ctx.clearRect(0, 0, W * s, H * s);
      // Sin franja de cabezal: la pantalla se descubre como un fundido.
      const pinceles = [[color.sector, []]];
      for (let k = 0; k < N; k++) if (turno[k] > t) pinceles[0][1].push(k);
      for (const [c, lista] of pinceles) {
        ctx.fillStyle = c;
        ctx.beginPath();
        for (const k of lista) ctx.rect((k % W) * s, Math.floor(k / W) * s, s, s);
        ctx.fill();
      }
      if (t < 1) requestAnimationFrame(paso);
      else lienzo.remove();
    };
    requestAnimationFrame(paso);
  };

  // 5. Foruster se recorre bajando. La ventana se queda fija y cada paso trae
  // su pantalla, que se lee al llegar.
  const recorridos = [...document.querySelectorAll("[data-recorrido]")].map((art) => {
    const pasos = [...art.querySelectorAll(".paso")];
    const pantallas = pasos.map((p) => document.getElementById(p.dataset.pantalla));
    for (const p of pantallas) p.hidden = false;
    art.classList.add("vivo");
    const rotulo = art.querySelector(".ventana-paso");
    const guia = art.querySelector(".pasos");

    let actual = -1;
    const mostrar = (i) => {
      if (i === actual) return;
      const antes = actual;
      actual = i;
      pasos.forEach((p, k) => p.classList.toggle("activo", k === i));
      pantallas.forEach((p, k) => {
        p.classList.toggle("activa", k === i);
        p.inert = k !== i;
      });
      if (rotulo) rotulo.textContent = pasos[i].querySelector("h3").textContent;
      if (antes !== -1) leerCaptura(pantallas[i]);
    };
    mostrar(0);
    const primera = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        leerCaptura(pantallas[actual]);
        primera.disconnect();
      }
    }, { threshold: 0.35 });
    primera.observe(art.querySelector(".escena"));

    // El paso activo es el que cruza una línea a media pantalla (más abajo en
    // el móvil, donde la ventana ocupa la parte de arriba).
    return () => {
      const linea = innerHeight * (innerWidth < 896 ? 0.7 : 0.5);
      let i = 0;
      pasos.forEach((p, k) => {
        if (p.getBoundingClientRect().top < linea) i = k;
      });
      mostrar(i);
      const g = guia.getBoundingClientRect();
      guia.style.setProperty("--progreso", limitar((linea - g.top) / Math.max(g.height, 1), 0, 1).toFixed(3));
    };
  });

  // Las capturas de «Otros trabajos» se leen una vez, al entrar en pantalla.
  const otras = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) {
        leerCaptura(e.target);
        otras.unobserve(e.target);
      }
    }
  }, { threshold: 0.4 });
  for (const c of document.querySelectorAll(".otro-captura")) otras.observe(c);

  // 6. Cada título se lee por sectores la primera vez que aparece, y las
  // aptitudes caen una tras otra, como objetos que se recogen.
  if (!quieto) {
    const vistos = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) {
          e.target.classList.add("leida");
          vistos.unobserve(e.target);
        }
      }
    }, { rootMargin: "0px 0px -12% 0px" });
    for (const t of document.querySelectorAll("main :is(h1, h2):not(.nombre), .proyecto h3, .otro h3, .aptitudes")) {
      if (t.closest(".portada")) continue;
      // Se observa el padre: el título, recortado, no cuenta como visible.
      const caja = t.parentElement;
      caja.classList.add("revela");
      vistos.observe(caja);
    }
    document.querySelectorAll(".aptitudes li").forEach((li, n) => li.style.setProperty("--n", n));
  }

  // 7. El contacto cierra la lectura: su losa se lee por filas al llegar.
  const contacto = document.querySelector("main > .contacto");
  if (contacto && !quieto) {
    contacto.classList.add("vivo-contacto");
    const alLlegar = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        contacto.classList.add("leida");
        alLlegar.disconnect();
      }
    }, { threshold: 0.25 });
    alLlegar.observe(contacto);
  }

  // 8. El marcador es un mapa: un tramo por zona, de su tamaño en la página.
  // El tramo se llena al leer la zona; con un clic se va a ella.
  const marcador = document.querySelector(".marcador");
  const zonas = [...document.querySelectorAll("[data-zona]")];
  let marcar = () => {};
  if (marcador) {
    const zona = marcador.querySelector(".marcador-zona");
    const inicioZona = zona.textContent;
    const valor = marcador.querySelector(".marcador-valor");
    const barra = marcador.querySelector(".marcador-barra");
    if (portada) {
      portada.dataset.zona = inicioZona;
      zonas.unshift(portada);
    }
    barra.replaceChildren();
    const tramos = zonas.map((z) => {
      const a = document.createElement("a");
      a.className = "tramo";
      a.href = "#" + z.id;
      a.tabIndex = -1;
      a.dataset.zona = z.dataset.zona;
      a.addEventListener("pointerenter", () => (zona.textContent = z.dataset.zona));
      a.addEventListener("pointerleave", () => marcar());
      barra.append(a);
      return a;
    });
    const enlaces = [...document.querySelectorAll(".nav a")].filter((e) => e.pathname === location.pathname);
    const repartir = () => {
      zonas.forEach((z, n) => (tramos[n].style.flexGrow = Math.max(1, Math.round(z.offsetHeight))));
    };
    repartir();
    addEventListener("resize", repartir);
    marcador.hidden = false;
    marcador.classList.add("oculto");
    // Aparece cuando el disco ya está copiado y se empieza a bajar: en la
    // primera pantalla no tapa nada.
    let copiado = false;
    alCopiar(() => {
      copiado = true;
      marcar();
    });
    marcar = () => {
      marcador.classList.toggle("oculto", !copiado || scrollY < innerHeight * 0.3);
      const total = raiz.scrollHeight - innerHeight;
      const pct = total > 0 ? Math.round(limitar(scrollY / total, 0, 1) * 100) : 100;
      valor.textContent = pct;
      // Cada tramo se llena con lo que se ha bajado dentro de su zona.
      const visto = scrollY + innerHeight * 0.45;
      let z = inicioZona, cual = 0;
      zonas.forEach((s, n) => {
        const r = s.getBoundingClientRect();
        const arriba = r.top + scrollY;
        const lleno = pct === 100 ? 1 : limitar((visto - arriba) / Math.max(s.offsetHeight, 1), 0, 1);
        tramos[n].style.setProperty("--lleno", lleno.toFixed(3));
        if (r.top < innerHeight * 0.45) (z = s.dataset.zona), (cual = n);
      });
      tramos.forEach((t, n) => t.classList.toggle("actual", n === cual));
      // La navegación de la cabecera dice también dónde se está.
      const id = zonas[cual].id;
      for (const e of enlaces) {
        if (e.hash === "#" + id) e.setAttribute("aria-current", "location");
        else e.removeAttribute("aria-current");
      }
      if (!marcador.matches(":hover")) zona.textContent = z;
    };
  }

  let campo = () => {};
  if (document.body && "ResizeObserver" in window) {
    const listo = document.fonts ? document.fonts.ready : Promise.resolve();
    listo.then(() => {
      campo = montarCampo();
      campo();
    });
  }

  let pendiente = false;
  const alMover = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      for (const r of recorridos) r();
      marcar();
      campo();
    });
  };
  addEventListener("scroll", alMover, { passive: true });
  addEventListener("resize", alMover);
  alMover();
})();
