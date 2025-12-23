// Get modal elements
const signInModal = document.getElementById('signInModal');
const registerModal = document.getElementById('registerModal');
const openSignInBtn = document.getElementById('openSignInModal');
const getStartedBtn = document.getElementById('getStartedBtn');
const closeSignInBtn = document.querySelector('.close-modal');
const closeRegisterBtn = document.querySelector('.close-register');
const switchToRegisterBtn = document.getElementById('switchToRegister');
const switchToLoginBtn = document.getElementById('switchToLogin');

// Function to close all modals
function closeAllModals() {
  signInModal.classList.remove('active');
  registerModal.classList.remove('active');
  document.body.style.overflow = '';
}

// Open sign in modal
if (openSignInBtn) {
  openSignInBtn.addEventListener('click', function(e) {
    e.preventDefault();
    closeAllModals();
    signInModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
}

// Open sign in modal from "Get Started" button
if (getStartedBtn) {
  getStartedBtn.addEventListener('click', function(e) {
    e.preventDefault();
    closeAllModals();
    signInModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
}

// Switch from login to register
if (switchToRegisterBtn) {
  switchToRegisterBtn.addEventListener('click', function(e) {
    e.preventDefault();
    signInModal.classList.remove('active');
    registerModal.classList.add('active');
  });
}

// Switch from register to login
if (switchToLoginBtn) {
  switchToLoginBtn.addEventListener('click', function(e) {
    e.preventDefault();
    registerModal.classList.remove('active');
    signInModal.classList.add('active');
  });
}

// Close sign in modal
if (closeSignInBtn) {
  closeSignInBtn.addEventListener('click', closeAllModals);
}

// Close register modal
if (closeRegisterBtn) {
  closeRegisterBtn.addEventListener('click', closeAllModals);
}

// Close modal when clicking outside
window.addEventListener('click', function(e) {
  if (e.target === signInModal || e.target === registerModal) {
    closeAllModals();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeAllModals();
  }
});