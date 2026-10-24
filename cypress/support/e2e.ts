beforeEach(() => {
  cy.request('POST', 'http://localhost:3000/api/test/reset').then((response) => {
    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({ ok: true });
  });
});
