describe('Acceso a Café Central', () => {
  it('abre la aplicación y muestra el catálogo', () => {
    cy.visit('/');
    cy.get('header a[aria-label="Café Central, inicio"]').should('be.visible');
    cy.get('[data-cy="catalog"]').should('be.visible');
  });
});
