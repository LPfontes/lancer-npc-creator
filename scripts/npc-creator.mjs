// Criador de PNJ do Lancer - ApplicationV2 Native Implementation
// Módulo Independente: lancer-npc-creator

class NpcCreatorApp extends foundry.applications.api.ApplicationV2 {
    constructor(options = {}) {
        super(options);
        this.classes = [];
        this.templates = [];
        this.features = [];

        this.selectedRoleFilter = "Todos";
        this.selectedClassLid = null;
        this.selectedTier = 1;
        this.selectedTemplateLids = [];
        this.checkedOptionalLids = [];
    }

    static DEFAULT_OPTIONS = {
        tag: "div",
        id: "npc-creator-app",
        classes: ["npc-creator-app-window"],
        position: { width: 1200, height: 800 },
        window: {
            title: "Criador de PNJ Lancer",
            icon: "fa-solid fa-robot"
        }
    };

    _replaceHTML(result, content, options) {
        content.replaceChildren(result);
    }

    async _renderHTML(context, options) {
        // Carrega os documentos dos compêndios caso ainda não estejam carregados
        if (this.classes.length === 0) {
            const allNPCClasses = [];
            const allNPCTemplates = [];
            const allNPCFeatures = [];

            // 1. Tentar prioritariamente carregar do compêndio brasileiro de features
            const primaryPack = game.packs.get("lancer-npcs-basico.npc-features");
            if (primaryPack) {
                try {
                    console.log("Lancer NPC Creator | Tentando carregar dados do compêndio prioritário: lancer-npcs-basico.npc-features");
                    const docs = await primaryPack.getDocuments();
                    allNPCClasses.push(...docs.filter(d => d.type === "npc_class"));
                    allNPCTemplates.push(...docs.filter(d => d.type === "npc_template"));
                    allNPCFeatures.push(...docs.filter(d => d.type === "npc_feature"));
                } catch (err) {
                    console.warn("Lancer NPC Creator | Erro ao carregar o compêndio básico prioritário:", err);
                }
            }

            // 2. Se nenhuma classe foi carregada (compêndio ausente ou vazio), varre todos os outros compêndios de itens ativos no jogo
            if (allNPCClasses.length === 0) {
                console.log("Lancer NPC Creator | Iniciando busca genérica de itens de PNJ em outros compêndios...");
                const itemPacks = game.packs.filter(p => p.metadata.type === "Item" || p.documentName === "Item");
                for (const pack of itemPacks) {
                    if (pack.collection === "lancer-npcs-basico.npc-features") continue;
                    try {
                        const index = await pack.getIndex();
                        const hasNpcDocs = index.some(idx => ["npc_class", "npc_template", "npc_feature"].includes(idx.type));
                        if (hasNpcDocs) {
                            console.log(`Lancer NPC Creator | Carregando documentos do compêndio compatível: ${pack.collection}`);
                            const docs = await pack.getDocuments();
                            allNPCClasses.push(...docs.filter(d => d.type === "npc_class"));
                            allNPCTemplates.push(...docs.filter(d => d.type === "npc_template"));
                            allNPCFeatures.push(...docs.filter(d => d.type === "npc_feature"));
                        }
                    } catch (err) {
                        console.error(`Lancer NPC Creator | Erro ao verificar compêndio ${pack.collection}:`, err);
                    }
                }
            }

            this.classes = allNPCClasses;
            this.templates = allNPCTemplates;
            this.features = allNPCFeatures;

            if (this.classes.length === 0) {
                ui.notifications.error("Não foi possível carregar nenhuma classe de PNJ ('npc_class') nos compêndios ativos.");
            } else {
                console.log(`Lancer NPC Creator | Sucesso ao inicializar. Encontrados: ${this.classes.length} classes, ${this.templates.length} templates, ${this.features.length} características.`);
            }
        }

        if (!this.selectedClassLid && this.classes.length > 0) {
            this.selectedClassLid = this.classes[0].system.lid;
        }

        const container = document.createElement("div");
        container.className = "npc-creator-app";

        this._renderAppContent(container);

        return container;
    }

    _renderAppContent(container) {
        container.innerHTML = "";

        // Filtrar as classes com base na função selecionada (role)
        let filteredClasses = this.classes;
        if (this.selectedRoleFilter && this.selectedRoleFilter !== "Todos") {
            filteredClasses = this.classes.filter(c => c.system.role === this.selectedRoleFilter);
        }

        // Se a classe atualmente selecionada não estiver na lista filtrada, troca para a primeira disponível
        if (filteredClasses.length > 0 && !filteredClasses.some(c => c.system.lid === this.selectedClassLid)) {
            this.selectedClassLid = filteredClasses[0].system.lid;
        }

        const selectedClass = filteredClasses.find(c => c.system.lid === this.selectedClassLid) || this.classes.find(c => c.system.lid === this.selectedClassLid);
        if (!selectedClass) {
            container.innerHTML = `<div class="error-panel">Nenhuma classe de PNJ encontrada. Certifique-se de que pelo menos um compêndio contendo itens do Lancer está ativo.</div>`;
            return;
        }

        // 1. Calcular estatísticas dinâmicas
        const tierIndex = this.selectedTier - 1;
        const baseStats = { ...selectedClass.system.base_stats[tierIndex] };

        let stats = { ...baseStats };

        const hasElite = this.selectedTemplateLids.includes("template_elite");
        const hasUltra = this.selectedTemplateLids.includes("template_ultra");
        const hasPeao = this.selectedTemplateLids.includes("template_peao");
        const hasVeterano = this.selectedTemplateLids.includes("template_veterano");
        const hasComandante = this.selectedTemplateLids.includes("template_comandante");

        // Aplicar modificações padrão de modelos
        if (hasElite) {
            stats.structure += 1;
            stats.stress += 1;
            stats.activations += 1;
        }
        if (hasUltra) {
            stats.structure += 3;
            stats.stress += 3;
            stats.activations += 2;
        }
        if (hasVeterano) {
            stats.structure += 1;
            stats.stress += 1;
        }
        if (hasComandante) {
            stats.structure += 1;
            stats.stress += 1;
        }

        // Compilar características ativas
        const activeFeatures = [];

        // Habilidades básicas da classe
        selectedClass.system.base_features.forEach(lid => {
            const feat = this.features.find(f => f.system.lid === lid);
            if (feat) activeFeatures.push(feat);
        });

        // Habilidades básicas dos modelos selecionados
        this.selectedTemplateLids.forEach(tLid => {
            const template = this.templates.find(t => t.system.lid === tLid);
            if (template) {
                template.system.base_features.forEach(lid => {
                    const feat = this.features.find(f => f.system.lid === lid);
                    if (feat) activeFeatures.push(feat);
                });
            }
        });

        // Habilidades opcionais selecionadas
        this.checkedOptionalLids.forEach(lid => {
            const feat = this.features.find(f => f.system.lid === lid);
            if (feat && !activeFeatures.includes(feat)) {
                activeFeatures.push(feat);
            }
        });

        // Aplicar bônus das características (como Esquiva Aprimorada / Esquiva Sobrenatural)
        activeFeatures.forEach(feat => {
            if (feat.system.bonus) {
                Object.entries(feat.system.bonus).forEach(([statName, val]) => {
                    if (stats[statName] !== undefined && val !== null) {
                        stats[statName] += Number(val);
                    }
                });
            }
        });

        // Aplicar overrides das características (como Peão forcando HP=1)
        activeFeatures.forEach(feat => {
            if (feat.system.override) {
                Object.entries(feat.system.override).forEach(([statName, val]) => {
                    if (stats[statName] !== undefined && val !== null) {
                        stats[statName] = Number(val);
                    }
                });
            }
        });

        if (hasPeao) {
            stats.hp = 1;
            stats.structure = 0;
            stats.stress = 0;
        }

        // 2. Montar interface HTML
        // Coluna Esquerda: Painel de Configurações
        const leftPanel = document.createElement("div");
        leftPanel.className = "creator-config-panel";

        // Seletor de Função (Filtro)
        const filterGroup = document.createElement("div");
        filterGroup.className = "form-group";
        filterGroup.innerHTML = `<label for="role-filter-select">Filtrar por Função (Tipo)</label>`;
        const filterSelect = document.createElement("select");
        filterSelect.id = "role-filter-select";

        // Obter todas as funções únicas disponíveis
        const availableRoles = ["Todos", ...new Set(this.classes.map(c => c.system.role).filter(Boolean))].sort();
        availableRoles.forEach(r => {
            const selectedAttr = r === this.selectedRoleFilter ? "selected" : "";
            filterSelect.innerHTML += `<option value="${r}" ${selectedAttr}>${r}</option>`;
        });

        filterSelect.addEventListener("change", (e) => {
            this.selectedRoleFilter = e.target.value;
            this.checkedOptionalLids = []; // Resetar opcionais ao trocar filtro
            this._renderAppContent(container);
        });
        filterGroup.appendChild(filterSelect);
        leftPanel.appendChild(filterGroup);

        // Seletor de Classe (Filtrado)
        const classGroup = document.createElement("div");
        classGroup.className = "form-group";
        classGroup.innerHTML = `<label for="class-select">Classe Base do PNJ</label>`;
        const classSelect = document.createElement("select");
        classSelect.id = "class-select";
        filteredClasses.forEach(c => {
            const selectedAttr = c.system.lid === this.selectedClassLid ? "selected" : "";
            classSelect.innerHTML += `<option value="${c.system.lid}" ${selectedAttr}>${c.name} (${c.system.role})</option>`;
        });
        classSelect.addEventListener("change", (e) => {
            this.selectedClassLid = e.target.value;
            this.checkedOptionalLids = []; // Resetar opcionais ao mudar de classe
            this._renderAppContent(container);
        });
        classGroup.appendChild(classSelect);
        leftPanel.appendChild(classGroup);

        // Seletor de Patamar (Tier)
        const tierGroup = document.createElement("div");
        tierGroup.className = "form-group";
        tierGroup.innerHTML = `
            <label>Patamar de Combate (Tier)</label>
            <div class="tier-buttons">
                <div class="tier-btn ${this.selectedTier === 1 ? 'active' : ''}" data-tier="1">Patamar I</div>
                <div class="tier-btn ${this.selectedTier === 2 ? 'active' : ''}" data-tier="2">Patamar II</div>
                <div class="tier-btn ${this.selectedTier === 3 ? 'active' : ''}" data-tier="3">Patamar III</div>
            </div>
        `;
        tierGroup.querySelectorAll(".tier-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                this.selectedTier = Number(btn.dataset.tier);
                this._renderAppContent(container);
            });
        });
        leftPanel.appendChild(tierGroup);

        // Seletor de Modelos (Templates)
        const templatesGroup = document.createElement("div");
        templatesGroup.className = "form-group";
        templatesGroup.innerHTML = `<label>Aplicar Modelos (Templates)</label>`;
        const templatesGrid = document.createElement("div");
        templatesGrid.className = "checkbox-grid";
        this.templates.forEach(t => {
            const checkedAttr = this.selectedTemplateLids.includes(t.system.lid) ? "checked" : "";
            templatesGrid.innerHTML += `
                <label class="checkbox-label">
                    <input type="checkbox" class="template-checkbox" value="${t.system.lid}" ${checkedAttr}>
                    ${t.name}
                </label>
            `;
        });
        templatesGrid.querySelectorAll(".template-checkbox").forEach(cb => {
            cb.addEventListener("change", () => {
                const lids = [];
                templatesGrid.querySelectorAll(".template-checkbox:checked").forEach(checkedCb => {
                    lids.push(checkedCb.value);
                });
                this.selectedTemplateLids = lids;

                // Limpar opcionais órfãos de modelos que foram desativados
                const activeOptionalLids = [...selectedClass.system.optional_features];
                lids.forEach(tLid => {
                    const template = this.templates.find(t => t.system.lid === tLid);
                    if (template) activeOptionalLids.push(...template.system.optional_features);
                });
                this.checkedOptionalLids = this.checkedOptionalLids.filter(lid => activeOptionalLids.includes(lid));

                this._renderAppContent(container);
            });
        });
        templatesGroup.appendChild(templatesGrid);
        leftPanel.appendChild(templatesGroup);

        // 1. Características Opcionais da Classe
        const classOptionalLids = [...selectedClass.system.optional_features];
        const classOptionalsGroup = document.createElement("div");
        classOptionalsGroup.className = "form-group";
        classOptionalsGroup.innerHTML = `<label>Características Opcionais da Classe</label>`;
        const classOptionalsGrid = document.createElement("div");
        classOptionalsGrid.className = "checkbox-grid";

        if (classOptionalLids.length > 0) {
            classOptionalLids.forEach(lid => {
                const feat = this.features.find(f => f.system.lid === lid);
                if (feat) {
                    const checkedAttr = this.checkedOptionalLids.includes(lid) ? "checked" : "";
                    classOptionalsGrid.innerHTML += `
                        <label class="checkbox-label" title="${feat.system.effect ? feat.system.effect.replace(/"/g, '&quot;') : ''}">
                            <input type="checkbox" class="class-optional-checkbox" value="${lid}" ${checkedAttr}>
                            ${feat.name}
                        </label>
                    `;
                }
            });

            classOptionalsGrid.querySelectorAll(".class-optional-checkbox").forEach(cb => {
                cb.addEventListener("change", () => {
                    const checkedLids = Array.from(classOptionalsGrid.querySelectorAll(".class-optional-checkbox:checked")).map(c => c.value);
                    const templateLids = this.checkedOptionalLids.filter(lid => !classOptionalLids.includes(lid));
                    this.checkedOptionalLids = [...checkedLids, ...templateLids];
                    this._renderAppContent(container);
                });
            });
            classOptionalsGroup.appendChild(classOptionalsGrid);
        } else {
            classOptionalsGroup.innerHTML += `<div class="no-options" style="color: #a0aec0; font-size: 0.8rem; text-align: center;">Nenhuma opção disponível para esta classe.</div>`;
        }
        leftPanel.appendChild(classOptionalsGroup);

        // 2. Características Opcionais dos Modelos (Templates)
        const templateOptionalLids = [];
        this.selectedTemplateLids.forEach(tLid => {
            const template = this.templates.find(t => t.system.lid === tLid);
            if (template) {
                templateOptionalLids.push(...template.system.optional_features);
            }
        });

        const templateOptionalsGroup = document.createElement("div");
        templateOptionalsGroup.className = "form-group";
        templateOptionalsGroup.innerHTML = `<label>Características Opcionais dos Modelos</label>`;
        const templateOptionalsGrid = document.createElement("div");
        templateOptionalsGrid.className = "checkbox-grid";

        if (templateOptionalLids.length > 0) {
            templateOptionalLids.forEach(lid => {
                const feat = this.features.find(f => f.system.lid === lid);
                if (feat) {
                    const checkedAttr = this.checkedOptionalLids.includes(lid) ? "checked" : "";
                    templateOptionalsGrid.innerHTML += `
                        <label class="checkbox-label" title="${feat.system.effect ? feat.system.effect.replace(/"/g, '&quot;') : ''}">
                            <input type="checkbox" class="template-optional-checkbox" value="${lid}" ${checkedAttr}>
                            ${feat.name}
                        </label>
                    `;
                }
            });

            templateOptionalsGrid.querySelectorAll(".template-optional-checkbox").forEach(cb => {
                cb.addEventListener("change", () => {
                    const checkedLids = Array.from(templateOptionalsGrid.querySelectorAll(".template-optional-checkbox:checked")).map(c => c.value);
                    const classLids = this.checkedOptionalLids.filter(lid => !templateOptionalLids.includes(lid));
                    this.checkedOptionalLids = [...classLids, ...checkedLids];
                    this._renderAppContent(container);
                });
            });
            templateOptionalsGroup.appendChild(templateOptionalsGrid);
        } else {
            templateOptionalsGroup.innerHTML += `<div class="no-options" style="color: #a0aec0; font-size: 0.8rem; text-align: center;">Nenhum modelo com opções adicionais selecionado.</div>`;
        }
        leftPanel.appendChild(templateOptionalsGroup);

        // Coluna Direita: Preview do PNJ (HUD)
        const rightPanel = document.createElement("div");
        rightPanel.className = "creator-preview-panel";

        // Cabeçalho HUD
        const modelsLabel = this.selectedTemplateLids.map(tLid => {
            const t = this.templates.find(temp => temp.system.lid === tLid);
            return t ? t.name : "";
        }).filter(x => x).join(" ") || "COMUM";

        rightPanel.innerHTML = `
            <div class="hud-header">
                <div class="hud-title">
                    <h2>${selectedClass.name}</h2>
                    <span>Função: ${selectedClass.system.role} | Modelos: ${modelsLabel}</span>
                </div>
                <div class="hud-badge">Patamar ${this.selectedTier}</div>
            </div>
        `;

        // Atributos Calculados (Grade HUD)
        const statsGrid = document.createElement("div");
        statsGrid.className = "stats-grid";
        statsGrid.innerHTML = `
            <div class="stat-box highlight" title="Pontos de Vida">
                <div class="stat-label">PV</div>
                <div class="stat-value">${stats.hp}</div>
            </div>
            <div class="stat-box" title="Armadura">
                <div class="stat-label">ARM</div>
                <div class="stat-value">${stats.armor}</div>
            </div>
            <div class="stat-box" title="Evasão">
                <div class="stat-label">EVA</div>
                <div class="stat-value">${stats.evasion}</div>
            </div>
            <div class="stat-box" title="Defesa Eletrônica">
                <div class="stat-label">DEF-E</div>
                <div class="stat-value">${stats.edef}</div>
            </div>
            <div class="stat-box highlight" title="Estrutura">
                <div class="stat-label">ESTRUT</div>
                <div class="stat-value">${stats.structure}</div>
            </div>
            <div class="stat-box highlight" title="Estresse">
                <div class="stat-label">ESTRES</div>
                <div class="stat-value">${stats.stress}</div>
            </div>
            <div class="stat-box" title="Limite de Calor">
                <div class="stat-label">CAP CALOR</div>
                <div class="stat-value">${stats.heatcap}</div>
            </div>
            <div class="stat-box" title="Velocidade">
                <div class="stat-label">VEL</div>
                <div class="stat-value">${stats.speed}</div>
            </div>
            <div class="stat-box" title="Tamanho">
                <div class="stat-label">TAM</div>
                <div class="stat-value">${stats.size}</div>
            </div>
            <div class="stat-box" title="Sensores">
                <div class="stat-label">SENS</div>
                <div class="stat-value">${stats.sensor_range}</div>
            </div>
            <div class="stat-box" title="Meta de Salvamento">
                <div class="stat-label">SALV</div>
                <div class="stat-value">${stats.save}</div>
            </div>
            <div class="stat-boxHighlight" style="background: rgba(226, 28, 52, 0.1); border: 1px solid #e21c34; border-radius: 4px; padding: 8px; text-align: center; display: flex; flex-direction: column; justify-content: center;" title="Ativações na Rodada">
                <div class="stat-label" style="color: #e21c34;">ATIV</div>
                <div class="stat-value">${stats.activations}</div>
            </div>
        `;
        rightPanel.appendChild(statsGrid);

        // Lista de Características Ativas (Habilidades do PNJ)
        const featuresSec = document.createElement("div");
        featuresSec.className = "features-section";
        featuresSec.innerHTML = `<div class="features-title">Habilidades e Características Equipadas (${activeFeatures.length})</div>`;

        activeFeatures.forEach(feat => {
            // Limpar marcações markdown de efeito para exibição HTML simples
            const effectHtml = feat.system.effect
                ? feat.system.effect
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/\n/g, '<br>')
                : "Sem efeito registrado.";

            const originName = feat.system.origin ? feat.system.origin.name || feat.system.origin.type : "Classe";

            featuresSec.innerHTML += `
                <div class="feature-card">
                    <div class="feature-header">
                        <span>${feat.name}</span>
                        <span class="feature-origin">${originName}</span>
                    </div>
                    <div class="feature-effect">${effectHtml}</div>
                </div>
            `;
        });
        rightPanel.appendChild(featuresSec);

        // Botão Gerar PNJ no Mundo
        const generateBtn = document.createElement("button");
        generateBtn.className = "generate-btn";
        generateBtn.innerHTML = `<i class="fa-solid fa-folder-plus"></i> Gerar PNJ no Mundo`;
        generateBtn.addEventListener("click", async () => {
            try {
                const templatesName = this.selectedTemplateLids.map(tLid => {
                    const t = this.templates.find(temp => temp.system.lid === tLid);
                    return t ? t.name : "";
                }).filter(x => x).join(" ");

                const actorName = `${selectedClass.name}${templatesName ? ' (' + templatesName + ')' : ''} - Patamar ${this.selectedTier}`;

                const actorData = {
                    name: actorName,
                    type: "npc",
                    img: selectedClass.img || "systems/lancer/assets/icons/npc_class.svg",
                    system: {
                        tier: this.selectedTier
                    },
                    items: []
                };

                // Inserir a classe
                actorData.items.push(selectedClass.toObject());

                // Inserir os templates
                this.selectedTemplateLids.forEach(tLid => {
                    const t = this.templates.find(temp => temp.system.lid === tLid);
                    if (t) actorData.items.push(t.toObject());
                });

                // Inserir todas as características ativas
                activeFeatures.forEach(feat => {
                    actorData.items.push(feat.toObject());
                });

                const actor = await Actor.create(actorData);
                ui.notifications.info(`PNJ "${actor.name}" gerado com sucesso na barra lateral!`);

                // Abrir a ficha do novo PNJ automaticamente
                actor.sheet.render(true);

                // Fechar a janela do criador
                this.close();
            } catch (err) {
                console.error("Lancer NPC Creator | Falha ao gerar o ator do PNJ:", err);
                ui.notifications.error("Erro ao gerar o PNJ no mundo. Veja o console do navegador para detalhes.");
            }
        });
        rightPanel.appendChild(generateBtn);

        // Juntar colunas na janela
        container.appendChild(leftPanel);
        container.appendChild(rightPanel);
    }
}

// Inserir botão de acesso no diretório de atores na barra lateral do Foundry (compatível com V13 / ApplicationV2)
Hooks.on("renderActorDirectory", (app, html, data) => {
    if (!game.user.isGM) return;

    // Em Foundry V13, o elemento html é um HTMLElement puro.
    // Para manter retrocompatibilidade caso seja um objeto jQuery, resolvemos para HTMLElement:
    const element = html instanceof HTMLElement ? html : (html[0] || html);
    if (!element || !element.querySelector) return;

    // Encontrar a seção de botões de cabeçalho
    const headerActions = element.querySelector(".header-actions.action-buttons");
    if (headerActions) {
        // Verificar se o botão já existe para evitar duplicações
        if (!headerActions.querySelector(".npc-creator-btn")) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "npc-creator-btn";
            btn.innerHTML = `
                <i class="fa-solid fa-robot" inert=""></i>
                <span>Criador de PNJ</span>
            `;
            btn.addEventListener("click", () => {
                new NpcCreatorApp().render({ force: true });
            });
            headerActions.appendChild(btn);
        }
    }
});
