window.robos.list().then(apps => {
  const grid = document.getElementById('apps');
  function render(query = '') {
    grid.replaceChildren();
    apps.filter(a => `${a.label} ${a.id} ${a.category}`.toLowerCase().includes(query.toLowerCase())).forEach(a => {
      const button = document.createElement('button'); button.textContent = a.label;
      const category = document.createElement('small'); category.textContent = a.category; button.append(category);
      button.addEventListener('click', async () => {
        try { await window.robos.launch(a.id); document.getElementById('status').textContent = `Opening ${a.label}…`; }
        catch (error) { document.getElementById('status').textContent = error.message; }
      });
      grid.append(button);
    });
  }
  document.getElementById('search').addEventListener('input', e => render(e.target.value)); render();
});
