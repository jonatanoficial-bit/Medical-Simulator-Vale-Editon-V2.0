/*
 * Script de customização do simulador.
 *
 * Este script é carregado após o script original do jogo e altera algumas
 * configurações de jogabilidade, adiciona um tutorial inicial e um botão de
 * dicas durante o atendimento.  A intenção é tornar a experiência mais
 * amigável para quem está aprendendo, conforme solicitado pelo usuário.
 */

// Executa quando o DOM estiver pronto.  Este listener é adicionado após
// o script original, portanto é executado depois que a engine foi
// inicializada no script base.
window.addEventListener('DOMContentLoaded', () => {
  try {
    // Mostra a animação de logo no início e, após alguns segundos, exibe a tela
    // de capa. A duração da animação é definida também no CSS (fadeLogo).
    const logoScreen = document.getElementById('logo-screen');
    const coverScreen = document.getElementById('cover-screen');
    if (logoScreen && coverScreen) {
      // Garante que a capa só apareça após a animação de abertura
      setTimeout(() => {
        logoScreen.classList.remove('active');
        coverScreen.classList.add('active');
      }, 2800); // tempo em milissegundos correspondente à animação de fade
    }
    // Ajusta o modo padrão para "Treinamento" (mais leve).
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) {
      modeSelect.value = 'training';
    }

    // Quando a engine estiver disponível, ajusta configurações de dificuldade.
    // Objetivo: desacelerar BEM a evolução para óbito e deixar o modo
    // Treinamento viável para iniciantes:
    // - 1 paciente por vez (sem fila grande)
    // - tempo do caso mais lento (tick mais demorado)
    // - intervalo entre pacientes (pequena pausa após finalizar)
    if (window.engine && window.engine.config) {
      const cfg = window.engine.config;

      // ------------------------------------------------------------
      // (A) Desacelerar MUITO a evolução
      // ------------------------------------------------------------

      // 1) Deterioração mais lenta (principal ajuste).
      // - Treinamento: bem mais "humano" para iniciantes.
      if (cfg.training) {
        // Bem mais lento (tempo para pedir exames, aguardar resultado,
        // medicar e fechar diagnóstico).
        cfg.training.deteriorationMultiplier = 0.05;
        cfg.training.penaltyMultiplier = 0.15;
      }
      // - Se existir um modo "casual"/"easy"/"story", suaviza também.
      if (cfg.casual) {
        cfg.casual.deteriorationMultiplier = Math.min(cfg.casual.deteriorationMultiplier ?? 0.30, 0.25);
      }

      // 2) Relógio do paciente mais lento (tick mais demorado).
      // O engine incrementa p.time em +1 por tick. Aumentando o tickMs, o tempo
      // "do caso" passa mais devagar no mundo real.
      cfg.tickMs = 2000; // 2s por tick (antes ~1s)

      // 3) 1 paciente por vez: desliga a "fila" automática.
      // Em vez de spawn periódico, só entra um novo paciente quando não houver
      // ninguém sendo atendido.
      cfg.baseNewPatientIntervalMs = 99999999;

      // 4) Se o motor tiver outros intervalos, aumentamos também.
      const maybeIntervalKeys = [
        'vitalsTickMs',
        'vitalsUpdateIntervalMs',
        'patientUpdateIntervalMs',
        'baseTickMs',
        'tickMs',
        'updateIntervalMs',
      ];
      for (const k of maybeIntervalKeys) {
        if (typeof cfg[k] === 'number' && isFinite(cfg[k]) && cfg[k] > 100) {
          cfg[k] = Math.round(cfg[k] * 2.0);
        }
      }

      // 5) Se houver multiplicador global de tempo/deterioração, reduz também.
      if (typeof cfg.deteriorationMultiplier === 'number') {
        cfg.deteriorationMultiplier = Math.min(cfg.deteriorationMultiplier, 0.6);
      }

      // ------------------------------------------------------------
      // (B) Implementar "1 paciente por vez" + pausa entre casos
      // ------------------------------------------------------------
      const engine = window.engine;

      // Monkeypatch do spawnPatient: só gera novo paciente se não existir nenhum.
      // Também cria uma pequena pausa ao finalizar o caso.
      if (!engine.__valePatchedSinglePatient) {
        engine.__valePatchedSinglePatient = true;

        const originalSpawn = engine.spawnPatient?.bind(engine);
        const SPAWN_DELAY_MS = 4000; // pausa entre casos (ajustável)

        engine.spawnPatient = function patchedSpawnPatient() {
          // Se já existe paciente em jogo, não cria outro.
          if (Array.isArray(this.patients) && this.patients.length > 0) return;

          // Se estiver em "cooldown", agenda e sai.
          const now = Date.now();
          const readyAt = this.__nextAllowedSpawnAt || 0;
          if (now < readyAt) {
            clearTimeout(this.__spawnTimer);
            this.__spawnTimer = setTimeout(() => {
              this.spawnPatient();
            }, Math.max(0, readyAt - now));
            return;
          }

          // Spawna agora.
          originalSpawn?.();
        };

        // Monkeypatch do start():
        // - inicia com 1 paciente
        // - não cria fila (remove o spawn duplo do original)
        // - mantém apenas o tick
        const originalStart = engine.start?.bind(engine);
        engine.start = function patchedStart() {
          // Chama o start original primeiro para inicializar tudo...
          originalStart?.();

          // ...mas remove qualquer paciente extra que tenha sido criado.
          if (Array.isArray(this.patients) && this.patients.length > 1) {
            this.patients = [this.patients[0]];
            this.activePatientId = this.patients[0]?.id || null;
            this.ui?.refreshPatients?.(this.patients, this.activePatientId);
          }

          // Desliga o intervalo de novos pacientes (mantém 1 por vez).
          if (this.newPatientInterval) {
            clearInterval(this.newPatientInterval);
            this.newPatientInterval = null;
          }
        };

        // Monkeypatch: após finalizar um caso, força um pequeno intervalo antes
        // de permitir novo spawn (mantém a lógica do engine sem reescrever tudo).
        const originalEvaluate = engine.evaluateCase?.bind(engine);
        if (originalEvaluate) {
          engine.evaluateCase = function patchedEvaluateCase(patient) {
            // Impede spawn imediato: configura um cooldown antes de qualquer spawn.
            this.__nextAllowedSpawnAt = Date.now() + SPAWN_DELAY_MS;

            // Executa lógica original.
            originalEvaluate(patient);

            // Se o original já tentou colocar mais pacientes, garante 1 só.
            if (Array.isArray(this.patients) && this.patients.length > 1) {
              this.patients = [this.patients[0]];
              this.activePatientId = this.patients[0]?.id || null;
              this.ui?.refreshPatients?.(this.patients, this.activePatientId);
            }

            // Se ficou vazio, agenda novo paciente (respeitando o cooldown).
            if (!this.patients || this.patients.length === 0) {
              clearTimeout(this.__spawnTimer);
              const wait = Math.max(0, (this.__nextAllowedSpawnAt || 0) - Date.now());
              this.__spawnTimer = setTimeout(() => {
                this.spawnPatient();
              }, wait);
            }
          };
        }
      }
    }

    // Define se o tutorial já foi concluído com base no localStorage.
    const tutorialPage = document.getElementById('tutorial-page');
    const tutorialClose = document.getElementById('tutorial-close');
    const completed = localStorage.getItem('medsim_tutorialCompleted');
    if (tutorialPage) {
      if (!completed) {
        // Mostra o tutorial removendo a classe hidden.
        tutorialPage.classList.remove('hidden');
      }
      // Vincula evento de fechar para registrar conclusão.
      if (tutorialClose) {
        tutorialClose.addEventListener('click', () => {
          tutorialPage.classList.add('hidden');
          localStorage.setItem('medsim_tutorialCompleted', '1');
        });
      }
    }

    // Adiciona botão de dicas na renderização do paciente.  Salva a função
    // original e insere lógica adicional após a renderização.
    if (typeof GameUI !== 'undefined' && GameUI.prototype) {
      const originalRender = GameUI.prototype.renderPatientDetails;
      GameUI.prototype.renderPatientDetails = function(p, engine) {
        // Chama o render original.
        originalRender.call(this, p, engine);
        // Após renderizar, injeta o botão de dicas (se houver paciente).
        if (!p) return;
        const actionsArea = this.patientDetails.querySelector('.actions-area');
        if (!actionsArea) return;
        // Verifica se já existe um botão de dica.
        if (!actionsArea.querySelector('#hint-btn')) {
          const hintRow = document.createElement('div');
          hintRow.className = 'actions-row';
          hintRow.innerHTML = '<button id="hint-btn" class="action-btn"><i>💡</i><span>Dica</span></button>';
          // Insere o botão de dicas antes do contêiner de informações para manter
          // a hierarquia visual.
          const infoContainer = actionsArea.querySelector('.info-container');
          if (infoContainer) {
            actionsArea.insertBefore(hintRow, infoContainer);
          } else {
            actionsArea.appendChild(hintRow);
          }
          const hintBtn = hintRow.querySelector('#hint-btn');
          hintBtn.addEventListener('click', () => {
            const suggestions = [];
            // Sugestões de exames obrigatórios.
            if (p.requiredExams && p.requiredExams.length > 0) {
              suggestions.push('Exames sugeridos:\n' + p.requiredExams.map(x => '- ' + x).join('\n'));
            }
            // Sugestões de medicações obrigatórias.
            if (p.requiredMeds && p.requiredMeds.length > 0) {
              suggestions.push('Medicações sugeridas:\n' + p.requiredMeds.map(x => '- ' + x).join('\n'));
            }
            // Diagnóstico provável.
            if (p.diagnosis) {
              suggestions.push('Diagnóstico provável:\n' + p.diagnosis);
            }
            // Exibe as dicas no painel de mensagens do paciente.
            this.showInfo('Dicas', suggestions.join('\n\n'));
          });
        }
      };
    }

    // Atualiza as imagens dos avatares para apontarem para o repositório remoto,
    // evitando imagens quebradas quando executado localmente.  O array
    // "avatars" é definido no script original e anexado ao escopo global.
    try {
      if (Array.isArray(window.avatars)) {
        window.avatars.forEach((av, idx) => {
          // Mantemos o nome do arquivo de avatar e apontamos para o diretório local
          // "images" criado nesta versão atualizada.  Isso garante que as
          // imagens sejam carregadas mesmo offline.
          av.image = `images/avatar${idx+1}.png`;
        });
      }
    } catch (_) {}
  } catch (err) {
    console.error('Erro ao aplicar personalizações:', err);
  }
});