/* Shared agile content: the Agile Manifesto values and the 12 principles,
   plus a banner renderer and a toast that can cite a principle. */

const AGILE_VALUES = [
    ['Individuals and interactions', 'over processes and tools'],
    ['Working software', 'over comprehensive documentation'],
    ['Customer collaboration', 'over contract negotiation'],
    ['Responding to change', 'over following a plan']
];

const AGILE_PRINCIPLES = [
    'Our highest priority is to satisfy the customer through early and continuous delivery of valuable software.',
    'Welcome changing requirements, even late in development. Agile processes harness change for the customer\'s competitive advantage.',
    'Deliver working software frequently, from a couple of weeks to a couple of months, with a preference for the shorter timescale.',
    'Business people and developers must work together daily throughout the project.',
    'Build projects around motivated individuals. Give them the environment and support they need, and trust them to get the job done.',
    'The most efficient and effective method of conveying information to and within a development team is face-to-face conversation.',
    'Working software is the primary measure of progress.',
    'Agile processes promote sustainable development. The sponsors, developers, and users should be able to maintain a constant pace indefinitely.',
    'Continuous attention to technical excellence and good design enhances agility.',
    'Simplicity, the art of maximizing the amount of work not done, is essential.',
    'The best architectures, requirements, and designs emerge from self-organizing teams.',
    'At regular intervals, the team reflects on how to become more effective, then tunes and adjusts its behavior accordingly.'
];

function renderManifesto(el, open = false) {
    el.innerHTML = `
        <div class="manifesto-head">
            <h2>The Agile Manifesto <span>comes first</span>: every practice on this page serves these values</h2>
            <button type="button" aria-expanded="${open}">${open ? 'Hide' : 'Show'} the 12 principles</button>
        </div>
        <div class="values">${AGILE_VALUES.map(([a, b]) => `<div class="value"><div class="over">${a}</div><div class="under">${b}</div></div>`).join('')}</div>
        <p class="manifesto-note">"While there is value in the items on the right, we value the items on the left more."</p>
        <div class="principles" ${open ? '' : 'hidden'}>${AGILE_PRINCIPLES.map((p, i) => `<div class="principle" id="principle-${i + 1}"><b>${String(i + 1).padStart(2, '0')}</b><span>${p}</span></div>`).join('')}</div>`;
    const btn = el.querySelector('button');
    const list = el.querySelector('.principles');
    btn.addEventListener('click', () => {
        list.hidden = !list.hidden;
        btn.textContent = `${list.hidden ? 'Show' : 'Hide'} the 12 principles`;
        btn.setAttribute('aria-expanded', String(!list.hidden));
    });
}

let _toastTimer;
function agileToast(msg, kind = '', principle = null) {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        document.body.appendChild(t);
    }
    t.innerHTML = '';
    t.append(msg);
    if (principle) {
        const ref = document.createElement('span');
        ref.className = 'principle-ref';
        ref.textContent = `Agile principle ${principle}: ${AGILE_PRINCIPLES[principle - 1]}`;
        t.appendChild(ref);
    }
    t.className = `toast show ${kind}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('show'), principle ? 6000 : 3500);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
