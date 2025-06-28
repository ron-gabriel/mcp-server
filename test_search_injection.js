
const testCases = [
  { input: 'meeting agenda', expected: '"meeting agenda"' },
  { input: 'project update', expected: '"project update"' },
  
  { input: 'test" OR subject:"confidential', expected: '"test  subject confidential"' },
  { input: 'normal AND (subject:secret)', expected: '"normal  subject secret"' },
  { input: 'query* OR NOT isRead:false', expected: '"query   isRead false"' },
  { input: 'test\\" NEAR password', expected: '"test password"' },
  { input: 'search<script>alert(1)</script>', expected: '"searchscriptalert1script"' },
  
  { input: '   multiple   spaces   ', expected: '"multiple spaces"' },
  { input: '"""quotes"""', expected: '"quotes"' },
  { input: '***wildcards***', expected: '"wildcards"' },
  
  { input: '"""', shouldThrow: true },
  { input: '***', shouldThrow: true },
  { input: '   ', shouldThrow: true }
];

console.log('Search Query Injection Fix Test Cases:');
console.log('=====================================');

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}:`);
  console.log(`Input: "${testCase.input}"`);
  if (testCase.shouldThrow) {
    console.log('Expected: Should throw MCPError');
  } else {
    console.log(`Expected: ${testCase.expected}`);
  }
});

console.log('\n\nSecurity Improvements:');
console.log('- Removes quotes that could break out of quoted context');
console.log('- Strips KQL operators (AND, OR, NOT, NEAR, ONEAR)');
console.log('- Removes parentheses and wildcards');
console.log('- Eliminates colon-based property queries');
console.log('- Wraps result in quotes for literal string search');
console.log('- Validates non-empty result after sanitization');
