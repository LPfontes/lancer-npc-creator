// Diálogo de Importação de LCP (v3 e v2) para o Criador de PNJ do Lancer
// Compatível com Foundry VTT V13 (ApplicationV2)

import { translateV3LcpBlob, importV3LcpFile, getJSZip } from "./v3-lcp-shim.mjs";

export class LcpImportDialog extends foundry.applications.api.ApplicationV2 {
    constructor(options = {}) {
        super(options);
        this.parentApp = options.parentApp || null;
        this.selectedFile = null;
        this.previewData = null;
        this.isImporting = false;
        this.importProgress = { done: 0, total: 0, percent: 0 };
        this.importResult = null;
    }

    static DEFAULT_OPTIONS = {
        tag: "div",
        id: "lcp-import-dialog-app",
        classes: ["npc-creator-app-window", "lcp-import-window"],
        position: { width: 650, height: "auto" },
        window: {
            title: "LANCER_NPC_CREATOR.ImportLCPTitle",
            icon: "fa-solid fa-file-import"
        }
    };

    _replaceHTML(result, content, options) {
        content.replaceChildren(result);
    }

    async _renderHTML(context, options) {
        const container = document.createElement("div");
        container.className = "lcp-import-dialog";
        this._renderDialogContent(container);
        return container;
    }

    async _renderDialogContent(container) {
        container.innerHTML = "";

        // Cabeçalho da janela
        const header = document.createElement("div");
        header.className = "lcp-dialog-header";
        header.innerHTML = `
            <div class="lcp-dialog-title">
                <i class="fa-solid fa-file-arrow-up"></i>
                <h2>${game.i18n.localize("LANCER_NPC_CREATOR.ImportLCPTitle")}</h2>
            </div>
            <p class="lcp-dialog-subtitle">${game.i18n.localize("LANCER_NPC_CREATOR.ImportLCPSubtitle")}</p>
        `;
        container.appendChild(header);

        // Se a importação já foi concluída
        if (this.importResult) {
            this._renderSuccessView(container);
            return;
        }

        // Se está atualmente em processo de importação
        if (this.isImporting) {
            this._renderProgressView(container);
            return;
        }

        // Se um arquivo foi selecionado e inspecionado com sucesso
        if (this.previewData) {
            this._renderPreviewView(container);
            return;
        }

        // Tela Inicial: Seleção e Dropzone de Arquivo
        this._renderDropzoneView(container);
    }

    _renderDropzoneView(container) {
        const dropZone = document.createElement("div");
        dropZone.className = "lcp-dropzone";
        dropZone.innerHTML = `
            <div class="dropzone-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
            <div class="dropzone-text">${game.i18n.localize("LANCER_NPC_CREATOR.ImportDropZone")}</div>
            <div class="dropzone-hint">${game.i18n.localize("LANCER_NPC_CREATOR.ImportDropZoneHint")}</div>
            <button type="button" class="dropzone-browse-btn">
                <i class="fa-solid fa-folder-open"></i> ${game.i18n.localize("LANCER_NPC_CREATOR.BrowseFile")}
            </button>
            <input type="file" class="dropzone-file-input" accept=".lcp,.zip" style="display: none;">
        `;

        const fileInput = dropZone.querySelector(".dropzone-file-input");
        const browseBtn = dropZone.querySelector(".dropzone-browse-btn");

        browseBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (file) this._inspectFile(file, container);
        });

        // Eventos Drag & Drop
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("dragover");
        });
        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("dragover");
        });
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("dragover");
            const file = e.dataTransfer.files?.[0];
            if (file) this._inspectFile(file, container);
        });

        container.appendChild(dropZone);
    }

    async _inspectFile(file, container) {
        this.selectedFile = file;
        container.innerHTML = `
            <div class="lcp-inspecting">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>${game.i18n.localize("LANCER_NPC_CREATOR.InspectingLCP")}</p>
            </div>
        `;

        try {
            const JSZip = await getJSZip();
            const buffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(buffer);

            const manifestFile = zip.file("lcp_manifest.json");
            if (!manifestFile) {
                throw new Error(game.i18n.localize("LANCER_NPC_CREATOR.ErrorMissingManifest"));
            }

            const manifest = JSON.parse(await manifestFile.async("string"));
            const isV3 = manifest.v3 === true || Object.keys(zip.files).some(name => /^npcc_.+\.json$/i.test(name) || name === "eidolon_layers.json");

            // Contagem rápida de conteúdo
            let classCount = 0;
            let templateCount = 0;
            let featureCount = 0;

            if (isV3) {
                for (const name of Object.keys(zip.files)) {
                    if (/^npcc_.+\.json$/i.test(name)) {
                        classCount++;
                        try {
                            const entries = JSON.parse(await zip.file(name).async("string"));
                            if (Array.isArray(entries)) featureCount += Math.max(0, entries.length - 1);
                        } catch (_) {}
                    } else if (/^npct_.+\.json$/i.test(name)) {
                        templateCount++;
                        try {
                            const entries = JSON.parse(await zip.file(name).async("string"));
                            if (Array.isArray(entries)) featureCount += Math.max(0, entries.length - 1);
                        } catch (_) {}
                    }
                }
                const eidolonFile = zip.file("eidolon_layers.json");
                if (eidolonFile) {
                    try {
                        const layers = JSON.parse(await eidolonFile.async("string"));
                        if (Array.isArray(layers)) templateCount += layers.length;
                    } catch (_) {}
                }
            } else {
                const clsFile = zip.file("npc_classes.json");
                if (clsFile) {
                    try {
                        const arr = JSON.parse(await clsFile.async("string"));
                        if (Array.isArray(arr)) classCount = arr.length;
                    } catch (_) {}
                }
                const tmplFile = zip.file("npc_templates.json");
                if (tmplFile) {
                    try {
                        const arr = JSON.parse(await tmplFile.async("string"));
                        if (Array.isArray(arr)) templateCount = arr.length;
                    } catch (_) {}
                }
                const featFile = zip.file("npc_features.json");
                if (featFile) {
                    try {
                        const arr = JSON.parse(await featFile.async("string"));
                        if (Array.isArray(arr)) featureCount = arr.length;
                    } catch (_) {}
                }
            }

            this.previewData = {
                name: manifest.name || file.name.replace(/\.lcp$/i, ""),
                version: manifest.version || "1.0.0",
                author: manifest.author || game.i18n.localize("LANCER_NPC_CREATOR.UnknownAuthor"),
                description: manifest.description || "",
                isV3,
                counts: {
                    classes: classCount,
                    templates: templateCount,
                    features: featureCount
                }
            };

            this._renderDialogContent(container);
        } catch (err) {
            console.error("Lancer NPC Creator | Falha ao inspecionar LCP:", err);
            ui.notifications.error(err.message || game.i18n.localize("LANCER_NPC_CREATOR.ErrorInspectFailed"));
            this.selectedFile = null;
            this.previewData = null;
            this._renderDialogContent(container);
        }
    }

    _renderPreviewView(container) {
        const preview = this.previewData;

        const card = document.createElement("div");
        card.className = "lcp-meta-card";
        card.innerHTML = `
            <div class="lcp-meta-header">
                <div class="lcp-meta-info">
                    <h3>${preview.name} <span class="lcp-version">v${preview.version}</span></h3>
                    <div class="lcp-author"><i class="fa-solid fa-user-pen"></i> ${preview.author}</div>
                </div>
                <div class="lcp-format-badge ${preview.isV3 ? 'badge-v3' : 'badge-v2'}">
                    ${preview.isV3 ? 'COMP/CON V3' : 'LEGACY V2'}
                </div>
            </div>
            ${preview.description ? `<div class="lcp-description">${preview.description}</div>` : ''}
            
            <div class="lcp-stats-grid">
                <div class="lcp-stat-box">
                    <div class="stat-number">${preview.counts.classes}</div>
                    <div class="stat-title">${game.i18n.localize("LANCER_NPC_CREATOR.ClassesFound")}</div>
                </div>
                <div class="lcp-stat-box">
                    <div class="stat-number">${preview.counts.templates}</div>
                    <div class="stat-title">${game.i18n.localize("LANCER_NPC_CREATOR.TemplatesFound")}</div>
                </div>
                <div class="lcp-stat-box">
                    <div class="stat-number">${preview.counts.features}</div>
                    <div class="stat-title">${game.i18n.localize("LANCER_NPC_CREATOR.FeaturesFound")}</div>
                </div>
            </div>

            <div class="lcp-actions-bar">
                <button type="button" class="btn-cancel">
                    <i class="fa-solid fa-xmark"></i> ${game.i18n.localize("LANCER_NPC_CREATOR.Cancel")}
                </button>
                <button type="button" class="btn-import-confirm">
                    <i class="fa-solid fa-file-import"></i> ${game.i18n.localize("LANCER_NPC_CREATOR.ConfirmImport")}
                </button>
            </div>
        `;

        card.querySelector(".btn-cancel").addEventListener("click", () => {
            this.selectedFile = null;
            this.previewData = null;
            this._renderDialogContent(container);
        });

        card.querySelector(".btn-import-confirm").addEventListener("click", () => {
            this._startImport(container);
        });

        container.appendChild(card);
    }

    async _startImport(container) {
        this.isImporting = true;
        this.importProgress = { done: 0, total: 0, percent: 0 };
        this._renderDialogContent(container);

        try {
            const onProgress = (done, total) => {
                this.importProgress.done = done;
                this.importProgress.total = total;
                this.importProgress.percent = total ? Math.floor((done / total) * 100) : 0;
                const bar = container.querySelector(".lcp-progress-fill");
                const text = container.querySelector(".lcp-progress-text");
                if (bar) bar.style.width = `${this.importProgress.percent}%`;
                if (text) text.textContent = `${this.importProgress.percent}% (${done}/${total})`;
            };

            const result = await importV3LcpFile(this.selectedFile, { onProgress });
            this.importResult = result;
            this.isImporting = false;

            ui.notifications.info(game.i18n.format("LANCER_NPC_CREATOR.ImportSuccess", {
                name: result.manifest?.name || this.previewData.name,
                classes: result.summary?.classes ?? this.previewData.counts.classes,
                templates: result.summary?.templates ?? this.previewData.counts.templates,
                features: result.summary?.features ?? this.previewData.counts.features
            }));

            // Recarregar os compêndios do criador de PNJ pai se estiver aberto
            if (this.parentApp && typeof this.parentApp.reloadCompendiums === "function") {
                await this.parentApp.reloadCompendiums();
            }

            this._renderDialogContent(container);
        } catch (err) {
            console.error("Lancer NPC Creator | Falha durante importação do LCP:", err);
            ui.notifications.error(game.i18n.localize("LANCER_NPC_CREATOR.ImportFailed"));
            this.isImporting = false;
            this._renderDialogContent(container);
        }
    }

    _renderProgressView(container) {
        const progressEl = document.createElement("div");
        progressEl.className = "lcp-progress-container";
        progressEl.innerHTML = `
            <div class="progress-header">
                <i class="fa-solid fa-gear fa-spin"></i>
                <span>${game.i18n.localize("LANCER_NPC_CREATOR.ImportingLCP")}</span>
            </div>
            <div class="lcp-progress-bar">
                <div class="lcp-progress-fill" style="width: ${this.importProgress.percent}%;"></div>
            </div>
            <div class="lcp-progress-text">${this.importProgress.percent}% (${this.importProgress.done}/${this.importProgress.total})</div>
        `;
        container.appendChild(progressEl);
    }

    _renderSuccessView(container) {
        const res = this.importResult;
        const successEl = document.createElement("div");
        successEl.className = "lcp-success-card";
        successEl.innerHTML = `
            <div class="success-icon"><i class="fa-solid fa-circle-check"></i></div>
            <h3>${game.i18n.localize("LANCER_NPC_CREATOR.ImportCompletedTitle")}</h3>
            <p>${game.i18n.format("LANCER_NPC_CREATOR.ImportSuccessDetails", {
                name: res.manifest?.name || this.previewData?.name,
                classes: res.summary?.classes ?? this.previewData?.counts.classes,
                templates: res.summary?.templates ?? this.previewData?.counts.templates,
                features: res.summary?.features ?? this.previewData?.counts.features
            })}</p>
            <div class="success-actions">
                <button type="button" class="btn-close-dialog">
                    <i class="fa-solid fa-check"></i> ${game.i18n.localize("LANCER_NPC_CREATOR.Close")}
                </button>
            </div>
        `;

        successEl.querySelector(".btn-close-dialog").addEventListener("click", () => {
            this.close();
        });

        container.appendChild(successEl);
    }
}

