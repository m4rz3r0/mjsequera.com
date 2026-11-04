// Tema de la página: claro, oscuro u OLED. Sin elección guardada, la hoja de
// estilos sigue al sistema. Va en <head> y sin defer para que no parpadee.
(() => {
  const raiz = document.documentElement;
  const temas = ["claro", "oscuro", "oled"];
  let guardado = null;
  try {
    guardado = localStorage.getItem("tema");
  } catch {}
  if (temas.includes(guardado)) raiz.dataset.tema = guardado;

  document.addEventListener("DOMContentLoaded", () => {
    const grupos = document.querySelectorAll(".tema");
    const botones = document.querySelectorAll(".tema button");
    const marcar = () => {
      const actual = raiz.dataset.tema || "auto";
      for (const b of botones) b.setAttribute("aria-pressed", String(b.value === actual));
    };
    for (const b of botones) {
      b.addEventListener("click", () => {
        if (temas.includes(b.value)) {
          raiz.dataset.tema = b.value;
          try { localStorage.setItem("tema", b.value); } catch {}
        } else {
          delete raiz.dataset.tema;
          try { localStorage.removeItem("tema"); } catch {}
        }
        marcar();
      });
    }
    marcar();
    for (const g of grupos) g.hidden = false;
  });
})();
