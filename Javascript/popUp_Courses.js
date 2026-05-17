const c11div = document.querySelector('.c11trigger');
const c12div = document.querySelector('.c12trigger');
const exitButton = document.querySelector('.exit-button');
const popUp = document.querySelector('.pop-up');

if (c11div && popUp) {
    c11div.addEventListener('click', () => {
        popUp.classList.toggle('active');
    });
}

if (c12div && popUp) {
    c12div.addEventListener('click', () => {
        popUp.classList.toggle('active');
    });
}

if (exitButton && popUp) {
    exitButton.addEventListener('click', () => {
        popUp.classList.toggle('active');
    });
}
