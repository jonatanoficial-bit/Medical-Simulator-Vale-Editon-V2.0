/*
 * Simulador Médico — melhorias de interface V3.
 *
 * Este arquivo preserva a engine e os assets do jogo. Ele não altera
 * métodos internos, temporizadores, dificuldade ou estado salvo em runtime.
 */
(() => {
  "use strict";

  const tutorialStorageKey = "medsim_tutorialCompleted_v3";

  window.addEventListener("DOMContentLoaded", () => {
    const logoScreen = document.getElementById("logo-screen");
    const coverScreen = document.getElementById("cover-screen");
    if (logoScreen && coverScreen) {
      window.setTimeout(() => {
        logoScreen.classList.remove("active");
        coverScreen.classList.add("active");
      }, 2800);
    }

    const tutorialPage = document.getElementById("tutorial-page");
    const tutorialClose = document.getElementById("tutorial-close");
    const nextCaseButton = document.getElementById("next-case-button");
    let startAfterTutorial = false;

    const isTutorialComplete = () => {
      try {
        return localStorage.getItem(tutorialStorageKey) === "1";
      } catch {
        return false;
      }
    };

    const showTutorial = () => {
      if (!tutorialPage) return;
      tutorialPage.classList.remove("hidden");
      tutorialClose?.focus();
    };

    const hideTutorial = () => {
      tutorialPage?.classList.add("hidden");
    };

    // Captura o primeiro clique antes do handler da engine. Assim, o tutorial
    // aparece antes do turno sem modificar a implementação do motor.
    document.addEventListener("click", (event) => {
      const control = event.target.closest?.("#next-case-button");
      if (!control || control !== nextCaseButton || isTutorialComplete()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      startAfterTutorial = true;
      showTutorial();
    }, true);

    tutorialClose?.addEventListener("click", () => {
      try {
        localStorage.setItem(tutorialStorageKey, "1");
      } catch {
        // O jogo continua funcional quando o navegador bloqueia armazenamento local.
      }
      hideTutorial();

      if (startAfterTutorial) {
        startAfterTutorial = false;
        nextCaseButton?.focus();
        nextCaseButton?.click();
      }
    });
  });
})();