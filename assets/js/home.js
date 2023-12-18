// Native horizontal scrolling works without JS. These buttons add a clear
// desktop affordance; touch, trackpad and keyboard scrolling remain native.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Keep the bottom of the work section in view when its catalogue changes size.
const catalogue = document.querySelector('.catalogue');
const root = document.documentElement;
let alignmentFrame = 0;
catalogue.querySelector('summary').addEventListener('click', () => {
  // Disable native re-snapping before the disclosure changes layout. Otherwise
  // closing instantly jumps to the new snap position before we can scroll.
  cancelAnimationFrame(alignmentFrame);
  root.classList.add('aligning-work');
});
catalogue.addEventListener('toggle', () => {
  cancelAnimationFrame(alignmentFrame);
  // Allow the disclosure and its carousel controls to finish layout first.
  alignmentFrame = requestAnimationFrame(() => {
    alignmentFrame = requestAnimationFrame(() => {
      const bottom = catalogue.closest('section').getBoundingClientRect().bottom;
      const top = scrollY + bottom - innerHeight;
      window.scrollTo({ top, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      const deadline = performance.now() + 1500;
      function settle() {
        // Also restore snapping if the visitor interrupts the smooth scroll.
        if (Math.abs(scrollY - top) < 2 || performance.now() > deadline) {
          root.classList.remove('aligning-work');
        } else alignmentFrame = requestAnimationFrame(settle);
      }
      alignmentFrame = requestAnimationFrame(settle);
    });
  });
});

for (const carousel of document.querySelectorAll('.carousel')) {
  const track = carousel.querySelector('.card-track');
  const cards = [...track.children];
  const controls = carousel.querySelector('.carousel-controls');
  const previous = controls.querySelector('[data-step="-1"]');
  const next = controls.querySelector('[data-step="1"]');
  const position = controls.querySelector('.carousel-position');
  let current = 0;
  const left = card => card.offsetLeft - cards[0].offsetLeft;
  function update() {
    if (!track.clientWidth) return;
    controls.hidden = track.scrollWidth <= track.clientWidth + 2;
    current = cards.reduce((best, card, index) =>
      Math.abs(left(card) - track.scrollLeft) < Math.abs(left(cards[best]) - track.scrollLeft) ? index : best, 0);
    previous.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    const text = `${next.disabled ? cards.length : current + 1} / ${cards.length}`;
    if (position.textContent !== text) position.textContent = text;
  }
  for (const button of [previous, next]) button.addEventListener('click', () => {
    const end = track.scrollWidth - track.clientWidth;
    const step = cards[1] ? left(cards[1]) : track.clientWidth;
    // Merge a nearly identical last-card position with the end of the row,
    // so an arrow click never moves just a few pixels.
    const stops = [0, ...cards.map(left).filter(x => x > 0 && x < end - step / 2), end];
    const forward = Number(button.dataset.step) > 0;
    const target = forward ? stops.find(x => x > track.scrollLeft + 2)
      : stops.reverse().find(x => x < track.scrollLeft - 2);
    track.scrollTo({ left: target ?? (forward ? end : 0), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
  track.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(track);
  update();
}

// Send the contact form in place. Without JS it still posts to Formspree and
// lands on their thank-you page; with it, the visitor stays here and sees
// whether the message actually went through.
const form = document.querySelector('.contact-form');
const status = form.querySelector('.form-status');
const submit = form.querySelector('.submit-button');
const submitLabel = submit.querySelector('.submit-label');
function showStatus(text, failed) {
  status.textContent = text;
  status.classList.toggle('error', failed);
  status.hidden = false;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  submitLabel.textContent = 'Sending…';
  status.hidden = true;
  try {
    const response = await fetch(form.action, {
      method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      form.reset();
      showStatus('Thanks, your message is on its way. I’ll get back to you soon.', false);
    } else {
      // Formspree explains rejections (bad email, spam filter) in `errors`.
      const data = await response.json().catch(() => ({}));
      const reason = data.errors?.map(e => (e.field ? `${e.field} ` : '') + e.message).join(', ');
      showStatus(`Your message wasn’t sent${reason ? `: ${reason}` : ` (error ${response.status})`}. Please try again.`, true);
    }
  } catch {
    // The field contents stay put, so a retry doesn't mean retyping.
    showStatus('Your message wasn’t sent. Check your connection and try again.', true);
  } finally {
    submit.disabled = false;
    submitLabel.textContent = 'Send message';
  }
});
