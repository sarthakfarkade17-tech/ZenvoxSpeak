import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));

test('firestore.rules enforces default-deny catch-all and email_verified', () => {
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
});

test('firestore.rules enforces Eight Pillars on every blueprint collection', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.ok(paths.includes('/users/{userId}'));
  assert.ok(paths.includes('/users/{userId}/vocabProgress/{wordId}'));
  assert.ok(paths.includes('/users/{userId}/practiceSessions/{sessionId}'));

  assert.match(rules, /isValidUserProfile\(incoming\(\), userId\)/);
  assert.match(rules, /isValidVocabProgress\(incoming\(\), userId, wordId\)/);
  assert.match(rules, /isValidPracticeSession\(incoming\(\), userId, sessionId\)/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly/);
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);
});

test('UserProfile schema bounds match rules validation', () => {
  const props = blueprint.entities.UserProfile.properties;
  assert.equal(props.displayName.maxLength, 80);
  assert.match(rules, /data\.displayName\.size\(\) <= 80/);
  assert.equal(props.uid.maxLength, 128);
  assert.match(rules, /id\.size\(\) <= 128/);
});
