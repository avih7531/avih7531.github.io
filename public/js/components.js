// Rejewvenate - Shared Components

function loadHeader() {
  return `
    <header>
      <div class="container">
        <a href="index.html">
          <img src="/icon.avif" alt="Rejewvenate Logo">
        </a>
        <nav>
          <a href="index.html">Home</a>
          <a href="about-us.html">About Us</a>
          <a href="team.html">Team</a>
          <a href="donate.html">Donate</a>
          <a href="contact.html">Contact</a>
        </nav>
      </div>
    </header>
  `;
}

function loadFooter() {
  return `
    <footer>
      <div class="socials">
        <a href="https://www.instagram.com/rejewvenate_bychb/" target="_blank">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Instagram_logo_2022.svg/2048px-Instagram_logo_2022.svg.png"
            alt="Instagram Logo">
          Instagram
        </a>
      </div>
      <div style="display: flex; justify-content: center; align-items: center; margin-top: 20px; position: relative;">
        <p style="margin: 0; flex-grow: 1; text-align: center;">&copy; 2025 by Rejewvenate.</p>
        <a href="/admin/dashboard" style="color: rgba(255, 255, 255, 0.7); text-decoration: none; font-size: 0.8rem; position: absolute; right: 0; cursor: pointer; z-index: 10; padding: 5px;" 
           onmouseover="this.style.color='rgba(255, 255, 255, 1)'" 
           onmouseout="this.style.color='rgba(255, 255, 255, 0.7)'">Admin Login</a>
      </div>
    </footer>
  `;
}

// Load components when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const headerPlaceholder = document.getElementById('header-placeholder');
  const footerPlaceholder = document.getElementById('footer-placeholder');
  
  if (headerPlaceholder) {
    headerPlaceholder.innerHTML = loadHeader();
  }
  
  if (footerPlaceholder) {
    footerPlaceholder.innerHTML = loadFooter();
  }
});
