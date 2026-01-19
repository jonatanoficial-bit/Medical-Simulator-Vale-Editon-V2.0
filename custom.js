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
    // Ajusta o modo padrão para "Treinamento" (mais leve).
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) {
      modeSelect.value = 'training';
    }

    // Quando a engine estiver disponível, ajusta configurações de dificuldade.
    if (window.engine && window.engine.config) {
      // Deterioração mais lenta e penalidade reduzida no modo de treinamento.
      if (window.engine.config.training) {
        window.engine.config.training.deteriorationMultiplier = 0.35;
        window.engine.config.training.penaltyMultiplier = 0.25;
      }
      // Aumenta o intervalo para chegada de novos pacientes para dar mais
      // tempo ao jogador (em milissegundos).
      window.engine.config.baseNewPatientIntervalMs = 20000;
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