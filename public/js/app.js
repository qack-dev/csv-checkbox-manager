/**
 * チェックボックス状態管理フロントエンドスクリプト
 */

// ==========================================================================
// 設定用グローバル定数
// ==========================================================================
const COLUMN_COUNT = 13;      // チェックボックスの列数
const CSV_PATH = 'data.csv';   // 読み込むCSVファイルのパス
const API_URL = '/api/states'; // チェック状態を管理するAPIエンドポイント

// ==========================================================================
// 状態管理
// ==========================================================================
let currentStates = {}; // key: `row_${rowIndex}_col_${colIndex}`, value: boolean

// ==========================================================================
// DOM要素の参照
// ==========================================================================
const dom = {
    tableContainer: document.getElementById('table-container'),
    loadingSpinner: document.getElementById('loading-spinner'),
    dataTable: document.getElementById('data-table'),
    tableHead: document.getElementById('table-head'),
    tableBody: document.getElementById('table-body'),
    btnSave: document.getElementById('btn-save'),
    toastContainer: document.getElementById('toast-container')
};

// ==========================================================================
// 初期化処理
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    try {
        // CSVデータとAPIからの保存状態を並行して取得
        const [csvText, statesData] = await Promise.all([
            fetchCsvData(CSV_PATH),
            fetchStatesData(API_URL)
        ]);

        currentStates = statesData || {};

        // CSVデータのパースとテーブル描画
        const rows = parseCsv(csvText);
        renderTable(rows, currentStates);

        // ローディング表示からテーブル表示へ切り替え
        dom.loadingSpinner.style.display = 'none';
        dom.dataTable.style.display = 'table';
    } catch (error) {
        console.error('初期化エラー:', error);
        dom.loadingSpinner.innerHTML = `
            <p style="color: var(--color-error);">データの読み込みに失敗しました。</p>
            <p style="font-size: 0.75rem; color: var(--color-text-muted);">${escapeHtml(error.message)}</p>
        `;
        showToast('データの読み込みに失敗しました', 'error');
    }
}

function setupEventListeners() {
    dom.btnSave.addEventListener('click', handleSave);
}

// ==========================================================================
// データ取得・通信処理
// ==========================================================================
async function fetchCsvData(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`CSVの取得に失敗しました (Status: ${response.status})`);
    }
    return await response.text();
}

async function fetchStatesData(url) {
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            console.warn(`状態APIの取得に失敗しました (Status: ${response.status})。初期状態を使用します。`);
            return {};
        }
        return await response.json();
    } catch (error) {
        console.warn('状態APIへの接続エラー。初期状態を使用します。', error);
        return {};
    }
}

async function handleSave() {
    // ボタンの無効化とローディング表示
    const originalText = dom.btnSave.innerHTML;
    dom.btnSave.disabled = true;
    dom.btnSave.innerHTML = '<span class="btn-text">保存中...</span>';

    // 画面上の全チェックボックスの状態を収集
    const updatedStates = {};
    const checkboxes = dom.tableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const stateKey = cb.dataset.key;
        if (stateKey) {
            updatedStates[stateKey] = cb.checked;
        }
    });

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(updatedStates)
        });

        if (!response.ok) {
            throw new Error(`保存処理に失敗しました (Status: ${response.status})`);
        }

        currentStates = updatedStates;
        showToast('チェック状態を正常に保存しました', 'success');
    } catch (error) {
        console.error('保存エラー:', error);
        showToast(`保存に失敗しました: ${error.message}`, 'error');
    } finally {
        dom.btnSave.disabled = false;
        dom.btnSave.innerHTML = originalText;
    }
}

// ==========================================================================
// CSVパース処理
// ==========================================================================
function parseCsv(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length === 0) return [];

    const rows = [];
    // ヘッダー行をスキップ（フォーマット: 期間,タイトル,URLのテキスト,URLのリンク）
    const startIndex = (lines[0].includes('期間') || lines[0].includes('タイトル')) ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = parseCsvLine(line);
        if (columns.length >= 4) {
            rows.push({
                period: columns[0].trim(),
                title: columns[1].trim(),
                urlText: columns[2].trim(),
                urlLink: columns[3].trim()
            });
        }
    }
    return rows;
}

/**
 * カンマ区切りおよびダブルクォートに対応した1行パーサー
 */
function parseCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur);
    return result;
}

// ==========================================================================
// テーブル描画処理
// ==========================================================================
function renderTable(rows, states) {
    // 1. ヘッダー生成
    let headerHtml = '<tr>';
    headerHtml += '<th class="col-period">期間</th>';
    headerHtml += '<th class="col-title">タイトル</th>';
    headerHtml += '<th class="col-url">URL</th>';
    for (let col = 1; col <= COLUMN_COUNT; col++) {
        headerHtml += `<th class="col-check">${col}</th>`;
    }
    headerHtml += '</tr>';
    dom.tableHead.innerHTML = headerHtml;

    // 2. ボディ生成
    let bodyHtml = '';
    rows.forEach((row, rowIndex) => {
        bodyHtml += '<tr>';
        bodyHtml += `<td class="col-period">${escapeHtml(row.period)}</td>`;
        bodyHtml += `<td class="col-title">${escapeHtml(row.title)}</td>`;

        const linkHtml = row.urlLink 
            ? `<a href="${escapeHtml(row.urlLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.urlText || 'リンク')}</a>`
            : escapeHtml(row.urlText);
        bodyHtml += `<td class="col-url">${linkHtml}</td>`;

        // チェックボックス列の生成
        for (let colIndex = 1; colIndex <= COLUMN_COUNT; colIndex++) {
            const key = `row_${rowIndex}_col_${colIndex}`;
            const isChecked = !!states[key];
            bodyHtml += `
                <td class="col-check">
                    <div class="checkbox-cell">
                        <input type="checkbox" 
                               class="custom-checkbox" 
                               id="${key}" 
                               data-key="${key}" 
                               ${isChecked ? 'checked' : ''} 
                               aria-label="行 ${rowIndex + 1} 列 ${colIndex} のチェックボックス">
                    </div>
                </td>
            `;
        }
        bodyHtml += '</tr>';
    });

    dom.tableBody.innerHTML = bodyHtml;
}

// ==========================================================================
// ユーティリティ
// ==========================================================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('transitionend', () => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        });
    }, 3000);
}
