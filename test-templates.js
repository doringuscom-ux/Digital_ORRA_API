const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://localhost:3000/api/templates');
    console.log("SUCCESS:", res.data);
  } catch (e) {
    console.log("WHOLE ERROR:");
    console.dir(e, { depth: 1 });
  }
}
test();
