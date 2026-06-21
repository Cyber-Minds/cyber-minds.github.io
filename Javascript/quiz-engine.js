/**
 * @file Shared multiple-choice quiz engine for CyberMinds.
 */
(function attachQuizEngine(global) {
  function getCorrectValues(question) {
    if (Array.isArray(question.correctValues) && question.correctValues.length) {
      return question.correctValues;
    }

    return [question.correctValue];
  }

  function toggleLabelSelection(input) {
    var labels = global.document.querySelectorAll(
      'label[for][for^="' + input.name + '-"]'
    );
    labels.forEach(function (label) {
      label.classList.remove('selected');
    });

    var activeLabel = global.document.querySelector('label[for="' + input.id + '"]');
    if (activeLabel) {
      activeLabel.classList.add('selected');
    }
  }

  function ensureRetryButton(submitButton) {
    var existing = global.document.getElementById('retryQuizBtn');
    if (existing) {
      return existing;
    }

    var retryButton = global.document.createElement('button');
    retryButton.type = 'button';
    retryButton.id = 'retryQuizBtn';
    retryButton.className = 'submit retry-submit';
    retryButton.textContent = 'Retry Quiz';
    retryButton.style.display = 'none';
    submitButton.insertAdjacentElement('afterend', retryButton);
    return retryButton;
  }

  function showExplanation(label) {
    var detail = label.querySelector('.answer-detail');
    if (detail) {
      detail.style.display = 'block';
    }
  }

  function resetQuestionState(questionNames) {
    questionNames.forEach(function (name) {
      global.document
        .querySelectorAll('input[name="' + name + '"]')
        .forEach(function (input) {
          input.checked = false;
        });

      global.document
        .querySelectorAll('input[name="' + name + '"] + label, label[for^="' + name + '-"]')
        .forEach(function (label) {
          label.classList.remove('selected', 'is-correct', 'is-incorrect');
          label.style.width = '';
          var detail = label.querySelector('.answer-detail');
          if (detail) {
            detail.style.display = 'none';
          }
        });
    });
  }

  function init(config) {
    var resultElement = global.document.getElementById(config.resultElementId || 'result');
    var submitButton = global.document.querySelector(config.submitSelector || '.submit');
    if (!resultElement || !submitButton || !Array.isArray(config.questions)) {
      return;
    }

    global.document.body.dataset.quizId = config.quizId;
    submitButton.type = 'button';
    resultElement.setAttribute('aria-live', 'polite');
    var retryButton = ensureRetryButton(submitButton);
    var questionNames = config.questions.map(function (question) {
      return question.name;
    });

    config.questions.forEach(function (question) {
      global.document
        .querySelectorAll('input[name="' + question.name + '"]')
        .forEach(function (input) {
          input.addEventListener('change', function () {
            toggleLabelSelection(input);

            if (config.explanationMode === 'immediate') {
              var label = global.document.querySelector('label[for="' + input.id + '"]');
              if (label) {
                showExplanation(label);
              }
            }
          });
        });
    });

    retryButton.addEventListener('click', function () {
      resetQuestionState(questionNames);
      retryButton.style.display = 'none';
      resultElement.textContent = '';
      submitButton.style.display = '';
      submitButton.focus();
    });

    submitButton.addEventListener('click', function () {
      var score = 0;

      config.questions.forEach(function (question) {
        var correctValues = getCorrectValues(question);
        var selected = global.document.querySelector(
          'input[name="' + question.name + '"]:checked'
        );

        global.document
          .querySelectorAll('input[name="' + question.name + '"]')
          .forEach(function (input) {
            var label = global.document.querySelector('label[for="' + input.id + '"]');
            if (!label) {
              return;
            }

            label.style.width = '80%';
            showExplanation(label);
            label.classList.remove('is-correct', 'is-incorrect');
            label.classList.add(
              correctValues.indexOf(input.value) !== -1 ? 'is-correct' : 'is-incorrect'
            );
          });

        if (selected && correctValues.indexOf(selected.value) !== -1) {
          score += 1;
        }
      });

      resultElement.textContent =
        'Your score is: ' + score + '/' + config.questions.length;
      submitButton.style.display = 'none';
      retryButton.style.display = config.allowRetry ? '' : 'none';

      if (global.CyberMindsProgress && typeof global.CyberMindsProgress.markQuizComplete === 'function') {
        global.CyberMindsProgress.markQuizComplete(config.quizId, {
          score,
          totalQuestions: config.questions.length,
        });
      }
    });
  }

  global.CyberMindsQuizEngine = {
    init,
  };
})(window);
