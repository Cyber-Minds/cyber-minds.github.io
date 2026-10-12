# Shared Quiz Engine

CyberMinds quizzes can use `Javascript/quiz-engine.js` to keep scoring,
explanations, retry behaviour, and local progress tracking consistent.

## Required markup

- Use grouped radio inputs with stable `name` values, one group per question.
- Give each input a unique `id`.
- Pair every input with a `<label for="...">`.
- Put explanation copy inside a nested `<div class="answer-detail">...</div>`
  inside the label.
- Keep a result container with `id="result"`.
- Keep a submit button with class `submit`.
- Keep native radio inputs keyboard reachable. The engine visually hides radio
  controls without removing them from keyboard interaction and adds a visible
  focus outline to the associated label.

## Example

```html
<li class="option">
  <input type="radio" name="q1" value="correct" id="q1-correct" />
  <label for="q1-correct">
    Correct answer
    <div class="answer-detail">
      Correct because this control blocks unauthorized access before execution.
    </div>
  </label>
</li>
```

```html
<script src="../../../Javascript/progress.js"></script>
<script src="../../../Javascript/quiz-engine.js"></script>
<script>
  window.CyberMindsQuizEngine.init({
    quizId: 'course-1-example-quiz',
    allowRetry: true,
    explanationMode: 'final',
    questions: [
      { name: 'q1', correctValue: 'correct' },
      { name: 'q2', correctValue: 'false' },
    ],
  });
</script>
```

## Behavior

- Scores each question from the configured `correctValue`.
- Reveals explanations after submission by default.
- Supports retry without a page refresh.
- Stores only safe local quiz IDs and score totals in
  `localStorage['cm_learning_progress_v1']`.
- Never sends selected answers or free-form learner input to analytics.

## Migration inventory

All scored legacy quizzes now use the shared engine: Course 3 Attacks, Course 4
Non-Technical Defense, Course 6 Linux, Course 7 Attacks, Course 8 Risks and
Protecting, Course 9 Pentesting, both Course 10 Networking quizzes, and both
Course 11 Cloud quizzes. Their existing page paths remain unchanged.

Course 5 Cryptography is currently a cipher-practice page with hints and
revealed solutions, but no scored radio questions, submit control, or result
container. It is therefore not configured as a scored shared-engine quiz.
