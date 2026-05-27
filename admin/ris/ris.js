const sessionUser = JSON.parse(localStorage.getItem('user') || 'null');

let allRIS = [];
let currentViewId = null;
let pendingAction = null;

// ── Sidebar / Logout ──────────────────────────────────────────

const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
document.getElementById('menuToggle').addEventListener('click', () => {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('show');
});
sidebarOverlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
});


// ── Toast ─────────────────────────────────────────────────────

function showToast(title, msg, type = 's') {
  const icons = { s: 'bi-check-circle-fill', w: 'bi-exclamation-circle-fill', e: 'bi-x-circle-fill' };
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.innerHTML = `
    <div class="toast-ico ${type}"><i class="bi ${icons[type]}"></i></div>
    <div class="toast-body"><strong>${title}</strong><p>${msg}</p></div>
    <button class="toast-close" onclick="this.closest('.toast-item').remove()"><i class="bi bi-x"></i></button>`;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 4000);
}

// ── Helpers ───────────────────────────────────────────────────

function statusLabel(status) {
  const map = {
    pending:   'Pending',
    approved:  'Approved',
    delivered: 'Delivered',
    rejected:  'Rejected',
  };
  return map[(status || '').toLowerCase()] || status || '';
}

function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Render ────────────────────────────────────────────────────

function applyFilters() {
  const q        = document.getElementById('searchInput').value.toLowerCase();
  const stat     = document.getElementById('statusFilter').value;
  const fromVal  = document.getElementById('dateFrom').value;
  const toVal    = document.getElementById('dateTo').value;
  const fromDate = fromVal ? new Date(fromVal) : null;
  const toDate   = toVal   ? new Date(toVal + 'T23:59:59') : null;
  const filtered = allRIS.filter(r => {
    const matchQ    = !q || String(r.id).includes(q) || (r.requested_by || '').toLowerCase().includes(q);
    const matchStat = !stat || (r.status || '').toLowerCase() === stat;
    const txDate    = r.created_at ? new Date(r.created_at) : null;
    const matchFrom = !fromDate || (txDate && txDate >= fromDate);
    const matchTo   = !toDate   || (txDate && txDate <= toDate);
    return matchQ && matchStat && matchFrom && matchTo;
  });
  renderTable(filtered);
}

function clearDateFilter() {
  document.getElementById('searchInput').value  = '';
  document.getElementById('statusFilter').value = '';
  document.getElementById('dateFrom').value     = '';
  document.getElementById('dateTo').value       = '';
  loadRIS();
}

function renderTable(data) {
  const tbody = document.getElementById('risBody');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('risCount');
  count.textContent = `${data.length} request${data.length !== 1 ? 's' : ''} found`;
  if (!data.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(r => {
    const totalItems = Array.isArray(r.items) ? r.items.length : (r.item_count || 0);
    const isPending    = r.status === 'pending';
    const isApproved   = r.status === 'approved';
    const canExportPdf = r.status === 'approved' || r.status === 'delivered';
    return `<tr>
      <td style="font-weight:800;color:var(--maroon);font-size:.9rem;">#${r.id}</td>
      <td style="font-weight:600;color:var(--text-1);">${r.requested_by || '—'}</td>
      <td style="text-align:center;">
        <span style="background:rgba(37,99,235,.1);color:#1d4ed8;padding:3px 11px;border-radius:20px;font-size:.78rem;font-weight:800;">${totalItems} item${totalItems !== 1 ? 's' : ''}</span>
      </td>
      <td>${statusLabel(r.status)}</td>
      <td style="color:var(--text-3);font-size:.82rem;">${fmtDate(r.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn-tbl btn-view" onclick="openViewModal(${r.id})"><i class="bi bi-eye"></i> View</button>
          ${isPending ? `
          <button class="btn-tbl btn-approve" onclick="approveRIS(${r.id})"><i class="bi bi-check-lg"></i> Approve</button>
          <button class="btn-tbl btn-reject"  onclick="rejectRIS(${r.id})"><i class="bi bi-x-lg"></i> Reject</button>
          ` : ''}
          ${isApproved ? `
          <button class="btn-tbl btn-approve" id="deliver-btn-${r.id}" onclick="markDelivered(${r.id})" style="background:rgba(29,78,216,.1);color:#1d4ed8;border-color:rgba(29,78,216,.22);" onmouseover="this.style.background='#1d4ed8';this.style.color='#fff';" onmouseout="this.style.background='rgba(29,78,216,.1)';this.style.color='#1d4ed8';"><i class="bi bi-box-arrow-in-down"></i> Delivered</button>
          ` : ''}
          ${canExportPdf ? `
          <button class="btn-tbl btn-pdf" onclick="generateRISPdf(${r.id})"><i class="bi bi-file-pdf-fill"></i> Export PDF</button>
          ` : ''}
          <button class="btn-tbl btn-delete" onclick="deleteRIS(${r.id})"><i class="bi bi-trash"></i> Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Load ──────────────────────────────────────────────────────

async function loadRIS(showLoader = false) {
  const refreshBtn = document.getElementById('btnRefresh');

  try {
    // loading state
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = `
    <i class="bi bi-arrow-clockwise spin"></i>
    Refresh
    `;
    }

    // important: no-cache fetch
    const res = await fetch(`${API}/ris?refresh=${Date.now()}`, {
  method: 'GET',
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

    if (!res.ok) {
      throw new Error('Failed to fetch RIS');
    }

      const data = await res.json();
      console.log('Fresh API data:', data);

      allRIS = Array.isArray(data) ? [...data] : [];

// force clear old table
const tbody = document.getElementById('risBody');
tbody.innerHTML = '';

// hide empty state while refreshing
document.getElementById('emptyState').style.display = 'none';

// rerender latest data immediately
renderTable(allRIS);

    // update badge
    if (window.setRisBadgeCount) {
      window.setRisBadgeCount(
        allRIS.filter(r => r.status === 'pending').length
      );
    }

    console.log('RIS refreshed:', allRIS.length);

  } catch (err) {
    console.error(err);

    allRIS = [];
    renderTable([]);

    showToast(
      'Error',
      'Failed to refresh RIS requests.',
      'e'
    );

  } finally {
    // restore button
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `
        <i class="bi bi-arrow-clockwise"></i> Refresh
      `;
    }
  }
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('statusFilter').addEventListener('change', applyFilters);
document.getElementById('dateFrom').addEventListener('change', applyFilters);
document.getElementById('dateTo').addEventListener('change', applyFilters);

// ── View Modal ────────────────────────────────────────────────

async function openViewModal(id) {
  currentViewId = id;

  const overlay  = document.getElementById('viewRISModal');
  const itemsEl  = document.getElementById('viewRISItems');
  const metaEl   = document.getElementById('viewRISMeta');

  document.getElementById('viewRISId').textContent        = `#${id}`;
  document.getElementById('viewRISRequester').textContent = '—';
  document.getElementById('viewRISDate').textContent      = '—';
  document.getElementById('viewRISStatus').textContent    = statusLabel('pending');
  metaEl.textContent = 'Loading…';
  itemsEl.innerHTML  = '<p style="text-align:center;color:var(--text-3);font-size:.85rem;padding:20px 0;"><span style="display:inline-block;width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--maroon);border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px;"></span>Loading…</p>';
  document.getElementById('viewRejectBtn').style.display  = 'none';
  document.getElementById('viewDeleteBtn').style.display  = 'none';
  document.getElementById('viewPdfBtn').style.display     = 'none';

  overlay.classList.add('show');
  overlay.onclick = e => { if (e.target === overlay) closeViewModal(); };

  try {
    const res = await fetch(`${API}/ris/${id}`);
    if (!res.ok) throw new Error();
    const r = await res.json();

    const cached = allRIS.find(x => x.id === id);
    if (cached) Object.assign(cached, r);

    document.getElementById('viewRISId').textContent        = `#${r.id}`;
    document.getElementById('viewRISRequester').textContent = r.requested_by || '—';
    document.getElementById('viewRISDate').textContent      = fmtDate(r.created_at);
    document.getElementById('viewRISStatus').textContent    = statusLabel(r.status);
    metaEl.textContent = `RIS #${r.id} — ${(r.items || []).length} item(s) requested`;

    if (!r.items || !r.items.length) {
      itemsEl.innerHTML = '<p style="text-align:center;color:var(--text-3);font-size:.85rem;padding:16px 0;">No items found.</p>';
    } else {
      itemsEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg);">
              <th style="padding:8px 12px;text-align:left;font-size:.72rem;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;border-bottom:1.5px solid var(--border-light);">#</th>
              <th style="padding:8px 12px;text-align:left;font-size:.72rem;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;border-bottom:1.5px solid var(--border-light);">Medicine Name</th>
              <th style="padding:8px 12px;text-align:center;font-size:.72rem;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;border-bottom:1.5px solid var(--border-light);">Quantity</th>
              <th style="padding:8px 12px;text-align:left;font-size:.72rem;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;border-bottom:1.5px solid var(--border-light);">Unit</th>
              <th style="padding:8px 12px;text-align:left;font-size:.72rem;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;border-bottom:1.5px solid var(--border-light);">Note</th>
            </tr>
          </thead>
          <tbody>
            ${r.items.map((item, idx) => `
              <tr style="${idx % 2 === 0 ? 'background:var(--surface);' : 'background:var(--bg);'}">
                <td style="padding:9px 12px;font-size:.82rem;color:var(--text-3);font-weight:700;border-bottom:1px solid var(--border-light);">${idx + 1}</td>
                <td style="padding:9px 12px;font-size:.88rem;font-weight:700;color:var(--text-1);border-bottom:1px solid var(--border-light);">${item.medicine_name || `Medicine #${item.medicine_id}`}</td>
                <td style="padding:9px 12px;text-align:center;border-bottom:1px solid var(--border-light);">
                  <span style="background:var(--maroon-glow);color:var(--maroon);padding:2px 11px;border-radius:20px;font-size:.8rem;font-weight:800;">${item.quantity}</span>
                </td>
                <td style="padding:9px 12px;font-size:.84rem;color:var(--text-2);border-bottom:1px solid var(--border-light);">${item.unit != null && item.unit !== '' ? item.unit : '—'}</td>
                <td style="padding:9px 12px;font-size:.84rem;color:var(--text-3);border-bottom:1px solid var(--border-light);">${item.note || '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }

    const isPending    = r.status === 'pending';
    const isApproved   = r.status === 'approved';
    const canExportPdf = r.status === 'approved' || r.status === 'delivered';
    document.getElementById('viewRejectBtn').style.display   = isPending  ? '' : 'none';
    document.getElementById('viewDeliverBtn').style.display  = isApproved ? '' : 'none';
    document.getElementById('viewDeleteBtn').style.display   = '';
    document.getElementById('viewPdfBtn').style.display      = canExportPdf ? '' : 'none';
  } catch {
    metaEl.textContent = 'Failed to load RIS details.';
    itemsEl.innerHTML  = '<p style="text-align:center;color:var(--red);font-size:.85rem;padding:16px 0;">Error loading items.</p>';
  }
}

function closeViewModal() {
  document.getElementById('viewRISModal').classList.remove('show');
  currentViewId = null;
}

function approveRIS(id)     { promptAction(id, 'approve'); }
function rejectRIS(id)      { promptAction(id, 'reject'); }
function deleteRIS(id)      { promptAction(id, 'delete'); }
function markDelivered(id)  { promptAction(id, 'deliver'); }

function rejectFromView()   { if (currentViewId !== null) { closeViewModal(); rejectRIS(currentViewId); } }
function deliverFromView()  { if (currentViewId !== null) { closeViewModal(); markDelivered(currentViewId); } }
function deleteFromView()   { if (currentViewId !== null) { closeViewModal(); deleteRIS(currentViewId); } }
function pdfFromView()      { if (currentViewId !== null) { generateRISPdf(currentViewId); } }

// ── Confirm Modal ─────────────────────────────────────────────

function promptAction(id, action) {
  pendingAction = { id, action };
  const isApprove = action === 'approve';
  const isDelete  = action === 'delete';

  let iconHtml, iconBg, iconBorder, titleText, msgText, btnText, btnCls;

  if (isApprove) {
    iconHtml  = '<i class="bi bi-check-circle-fill" style="font-size:2.1rem;color:#16a34a;"></i>';
    iconBg    = 'rgba(22,163,74,.1)';
    iconBorder = '2px solid rgba(22,163,74,.22)';
    titleText = 'Approve RIS';
    msgText   = `Approve RIS #${id}? This will mark the request as Approved (For Purchase). Stock is updated only when marked as Delivered.`;
    btnText   = 'Approve';
    btnCls    = 'btn-modal-approve';
  } else if (action === 'deliver') {
    iconHtml  = '<i class="bi bi-box-arrow-in-down" style="font-size:2.1rem;color:#1d4ed8;"></i>';
    iconBg    = 'rgba(29,78,216,.1)';
    iconBorder = '2px solid rgba(29,78,216,.22)';
    titleText = 'Mark as Delivered';
    msgText   = `Mark RIS #${id} as Delivered? This will update medicine stock quantities and complete the request.`;
    btnText   = 'Mark Delivered';
    btnCls    = 'btn-modal-approve';
  } else if (isDelete) {
    iconHtml  = '<i class="bi bi-trash-fill" style="font-size:2.1rem;color:#c0392b;"></i>';
    iconBg    = 'rgba(192,57,43,.1)';
    iconBorder = '2px solid rgba(192,57,43,.22)';
    titleText = 'Delete RIS';
    msgText   = `Delete RIS #${id}? This will permanently remove the request and cannot be undone.`;
    btnText   = 'Delete';
    btnCls    = 'btn-modal-danger';
  } else {
    iconHtml  = '<i class="bi bi-x-circle-fill" style="font-size:2.1rem;color:#c0392b;"></i>';
    iconBg    = 'rgba(192,57,43,.1)';
    iconBorder = '2px solid rgba(192,57,43,.22)';
    titleText = 'Reject RIS';
    msgText   = `Reject RIS #${id}? This will mark the request as rejected.`;
    btnText   = 'Reject';
    btnCls    = 'btn-modal-danger';
  }

  const iconWrap = document.getElementById('confirmIconWrap');
  iconWrap.innerHTML   = iconHtml;
  iconWrap.style.background = iconBg;
  iconWrap.style.border     = iconBorder;

  document.getElementById('confirmTitle').textContent = titleText;
  document.getElementById('confirmMsg').textContent   = msgText;

  const reasonWrap = document.getElementById('rejectReasonWrap');
  const reasonInput = document.getElementById('rejectReasonInput');
  if (action === 'reject') {
    reasonWrap.style.display = '';
    reasonInput.value = '';
  } else {
    reasonWrap.style.display = 'none';
    reasonInput.value = '';
  }

  const btn = document.getElementById('confirmActionBtn');
  btn.textContent = btnText;
  btn.className   = btnCls;
  btn.disabled    = false;

  const overlay = document.getElementById('confirmModal');
  overlay.classList.add('show');
  overlay.onclick = e => { if (e.target === overlay) closeConfirmModal(); };
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('show');
  pendingAction = null;
}

async function executeConfirm() {
  if (!pendingAction) return;
  const { id, action } = pendingAction;

  const btn = document.getElementById('confirmActionBtn');
  btn.disabled = true;
  btn.textContent = 'Processing…';

  try {
    const isDelete = action === 'delete';
    const url    = isDelete ? `${API}/ris/${id}` : `${API}/ris/${id}/${action}`;
    const method = isDelete ? 'DELETE' : 'PUT';

    const fetchOpts = { method, headers: { 'Content-Type': 'application/json' } };
    if (action === 'reject') {
      const reason = (document.getElementById('rejectReasonInput').value || '').trim();
      fetchOpts.body = JSON.stringify({ reason: reason || null });
    }

    const res = await fetch(url, fetchOpts);
    closeConfirmModal();

    if (res.ok) {
      const label = action === 'approve'  ? 'Approved'
                  : action === 'deliver'  ? 'Delivered'
                  : action === 'delete'   ? 'Deleted'
                  : 'Rejected';
      const type  = (action === 'approve' || action === 'deliver') ? 's' : 'w';
      showToast(`RIS ${label}`, `RIS #${id} has been ${label.toLowerCase()}.`, type);
      await loadRIS();
    } else {
      const err = await res.json();
      showToast('Error', err.error || `Failed to ${action} RIS.`, 'e');
      if (res.status === 404) await loadRIS();
    }
  } catch {
    closeConfirmModal();
    showToast('Error', 'Network error. Please try again.', 'e');
  }
}

// ── PDF Export ────────────────────────────────────────────────

async function generateRISPdf(id) {
  try {
    const res = await fetch(`${API}/ris/${id}`);
    if (!res.ok) throw new Error();
    const r = await res.json();

    const { jsPDF } = window.jspdf;
    const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const margin = 18;
    const cW     = pageW - margin * 2;
    let y = 0;

    // ── Maroon header banner ───────────────────────────────────
    doc.setFillColor(123, 29, 30);
    doc.rect(0, 0, pageW, 40, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('MediTrack Clinic', pageW / 2, 15, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(240, 210, 210);
    doc.text('Requisition and Issue Slip (RIS)', pageW / 2, 24, { align: 'center' });

    doc.setFontSize(8);
    doc.setTextColor(210, 175, 175);
    doc.text('Clinic · Pampanga State University', pageW / 2, 32, { align: 'center' });

    y = 52;

    // ── Info box ───────────────────────────────────────────────
    const divX    = margin + cW * 0.54;
    const boxH    = 38;

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y - 6, cW, boxH, 2, 2, 'S');
    doc.setDrawColor(220, 220, 220);
    doc.line(divX, y - 6, divX, y - 6 + boxH);

    const leftRows  = [
      ['Entity Name:',     'MediTrack Clinic'],
      ['Office:',          'Clinic'],
      ['Purpose:',         'Restocking of medicines'],
    ];
    const rightRows = [
      ['RIS No.:',         `#${r.id}`],
      ['Date:',            fmtDate(r.created_at)],
      ['Requested By:',    r.requested_by || '—'],
    ];

    leftRows.forEach(([lbl, val], i) => {
      const ry = y + i * 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(130, 80, 80);
      doc.text(lbl, margin + 4, ry);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 30);
      doc.text(String(val), margin + 38, ry);
    });

    const rX = divX + 5;
    rightRows.forEach(([lbl, val], i) => {
      const ry = y + i * 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(130, 80, 80);
      doc.text(lbl, rX, ry);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 30);
      doc.text(String(val), rX + 30, ry);
    });

    y += boxH + 4;

    // ── Status pill ────────────────────────────────────────────
    const statusColors = {
      approved:  [22, 163, 74],
      delivered: [29, 78, 216],
      rejected:  [220, 38, 38],
      pending:   [201, 140, 0],
    };
    const sColor = statusColors[(r.status || '').toLowerCase()] || statusColors.pending;
    doc.setFillColor(...sColor);
    doc.roundedRect(margin, y, 34, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text((r.status || 'pending').toUpperCase(), margin + 17, y + 5, { align: 'center' });

    y += 14;

    // ── Items table ────────────────────────────────────────────
    const items = r.items || [];

    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [['#', 'Medicine Name', 'Qty', 'Unit']],
        body: items.length
          ? items.map((item, idx) => [
              idx + 1,
              item.medicine_name || `Medicine #${item.medicine_id}`,
              item.quantity,
              item.unit || '—',
            ])
          : [['', 'No items found.', '', '']],
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
          lineColor: [210, 210, 210],
          lineWidth: 0.3,
          textColor: [30, 30, 30],
          valign: 'middle',
        },
        headStyles: {
          fillColor: [123, 29, 30],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 13,  halign: 'center' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 22,  halign: 'center' },
          3: { cellWidth: 26,  halign: 'center' },
        },
        alternateRowStyles: { fillColor: [253, 250, 250] },
        tableLineColor: [200, 200, 200],
        tableLineWidth: 0.3,
      });
      y = doc.lastAutoTable.finalY + 14;
    } else {
      // Fallback: manual bordered table
      const colW  = [13, cW - 13 - 22 - 26, 22, 26];
      const colX  = [margin, margin + 13, margin + 13 + colW[1], margin + 13 + colW[1] + 22];
      const rH    = 8;
      const hdrs  = ['#', 'Medicine Name', 'Qty', 'Unit'];

      doc.setFillColor(123, 29, 30);
      doc.rect(margin, y, cW, rH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      hdrs.forEach((h, i) => {
        const cx = colX[i] + colW[i] / 2;
        doc.text(h, cx, y + 5.5, { align: 'center' });
      });
      y += rH;

      (items.length ? items : [null]).forEach((item, idx) => {
        if (idx % 2 === 1) { doc.setFillColor(253, 250, 250); doc.rect(margin, y, cW, rH, 'F'); }
        doc.setDrawColor(210, 210, 210);
        doc.setLineWidth(0.25);
        doc.rect(margin, y, cW, rH, 'S');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 30, 30);
        if (!item) {
          doc.setTextColor(150, 150, 150);
          doc.text('No items found.', pageW / 2, y + 5.5, { align: 'center' });
        } else {
          doc.text(String(idx + 1), colX[0] + colW[0] / 2, y + 5.5, { align: 'center' });
          doc.text(item.medicine_name || `Medicine #${item.medicine_id}`, colX[1] + 2, y + 5.5);
          doc.text(String(item.quantity), colX[2] + colW[2] / 2, y + 5.5, { align: 'center' });
          doc.text(item.unit || '—', colX[3] + colW[3] / 2, y + 5.5, { align: 'center' });
        }
        y += rH;
      });
      y += 14;
    }

    // ── Signature section ──────────────────────────────────────
    if (y > pageH - 62) { doc.addPage(); y = 22; }

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 4, pageW - margin, y - 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(123, 29, 30);
    doc.text('SIGNATORIES', margin, y + 2);
    y += 10;

    const sigs   = ['Requested by', 'Approved by', 'Issued by', 'Received by'];
    const sigW   = cW / 2;
    const lineL  = sigW * 0.74;

    sigs.forEach((label, i) => {
      const col  = i % 2;
      const row  = Math.floor(i / 2);
      const sx   = margin + col * sigW;
      const sy   = y + row * 28;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      doc.text(label + ':', sx, sy);

      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.3);
      doc.line(sx, sy + 13, sx + lineL, sy + 13);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(160, 160, 160);
      doc.text('Signature over Printed Name / Date', sx + lineL / 2, sy + 17, { align: 'center' });
    });

    // ── Page footer ────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(190, 190, 190);
    doc.text(
      `MediTrack Clinic  ·  RIS #${r.id}  ·  Generated on ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      pageW / 2, pageH - 8, { align: 'center' }
    );

    doc.save(`RIS_${r.id}.pdf`);
    showToast('PDF Generated', `RIS #${r.id} exported successfully.`, 's');
  } catch {
    showToast('Error', 'Failed to generate PDF.', 'e');
  }
}

// ── Keyboard ──────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('viewRISModal').classList.contains('show'))  closeViewModal();
    if (document.getElementById('confirmModal').classList.contains('show'))  closeConfirmModal();
  }
});

// ── Init ──────────────────────────────────────────────────────

loadRIS();

if (!window._risBadgeInterval) {
  window._risBadgeInterval = setInterval(loadRIS, 10000);
}
document
  .getElementById('btnRefresh')
  .addEventListener('click', () => {
    loadRIS(true);
  });