describe('Pedidos de Café Central', () => {
  beforeEach(() => {
    cy.request('http://localhost:3000/api/products').then(({ status, body }) => {
      expect(status).to.equal(200);
      expect(body).to.deep.equal([
        { id: 1, name: 'Café americano', price: 15, stock: 20 },
        { id: 2, name: 'Capuchino', price: 22, stock: 15 },
        { id: 3, name: 'Croissant', price: 18, stock: 12 },
        { id: 4, name: 'Té chai', price: 20, stock: 10 },
      ]);
    });
    cy.request({
      url: 'http://localhost:3000/api/orders/1',
      failOnStatusCode: false,
    }).its('status').should('equal', 404);

    cy.intercept('GET', '/api/products', (request) => {
      // Cada escenario necesita el catálogo actual, sin respuestas condicionales 304.
      delete request.headers['if-none-match'];
      delete request.headers['if-modified-since'];
    }).as('getProducts');
    cy.intercept('POST', '/api/orders').as('createOrder');
    cy.visit('/');
    cy.wait('@getProducts').its('response.statusCode').should('equal', 200);
    cy.contains('h2', 'Nuestro menú').should('be.visible');
  });

  it('confirma un pedido de Q48.00 y verifica su persistencia mediante la API', () => {
    cy.get('button[aria-label="Agregar Café americano"]').click();
    cy.get('button[aria-label="Aumentar Café americano"]').click();
    cy.get('input[aria-label="Cantidad de Café americano"]').should('have.value', '2');
    cy.get('button[aria-label="Agregar Croissant"]').click();
    cy.get('input[aria-label="Cantidad de Croissant"]').should('have.value', '1');
    cy.get('[data-cy="subtotal-1"]').should('have.text', 'Q30.00');
    cy.get('[data-cy="subtotal-3"]').should('have.text', 'Q18.00');

    cy.get('[data-cy="cart-total"]').should('be.visible').and('have.text', 'Q48.00')
      .invoke('text').then((displayedTotal) => {
        cy.contains('button', /^Confirmar pedido$/).should('be.enabled').click();
        cy.wait('@createOrder').then(({ request, response }) => {
          expect(request.method).to.equal('POST');
          expect(new URL(request.url).pathname).to.equal('/api/orders');
          expect(request.body).to.deep.equal({
            items: [{ productId: 1, quantity: 2 }, { productId: 3, quantity: 1 }],
          });
          expect(response?.statusCode).to.equal(201);
          const { id, total } = response!.body as { id: number; total: number };
          expect(id).to.equal(1);
          expect(total).to.equal(48);
          expect(`Q${total.toFixed(2)}`).to.equal(displayedTotal);

          cy.get('[data-cy="order-success"]').should('be.visible')
            .and('contain.text', '¡Pedido confirmado!');
          cy.get('[data-cy="order-id"]').should('be.visible').and('have.text', `#${id}`);
          cy.get('[data-cy="order-total"]').should('have.text', displayedTotal);
          cy.request(`http://localhost:3000/api/orders/${id}`).then((persisted) => {
            expect(persisted.status).to.equal(200);
            expect(persisted.body.id).to.equal(id);
            expect(persisted.body.total).to.equal(total);
            expect(`Q${persisted.body.total.toFixed(2)}`).to.equal(displayedTotal);
            expect(persisted.body.items).to.deep.equal([
              { productId: 1, name: 'Café americano', quantity: 2, unitPrice: 15, subtotal: 30 },
              { productId: 3, name: 'Croissant', quantity: 1, unitPrice: 18, subtotal: 18 },
            ]);
          });
        });
      });
  });

  it('bloquea un pedido vacío sin enviar ningún POST de creación', () => {
    cy.get('[data-cy="cart-count"]').should('have.text', '0');
    cy.get('[data-cy="cart-total"]').should('have.text', 'Q0.00');
    cy.contains('button', /^Confirmar pedido$/).should('be.visible').and('be.disabled');
    cy.contains('p', 'Agrega productos para confirmar tu pedido.').should('be.visible');
    cy.get('@createOrder.all').should('have.length', 0);
    cy.request({
      url: 'http://localhost:3000/api/orders/1',
      failOnStatusCode: false,
    }).its('status').should('equal', 404);
    cy.get('@createOrder.all').should('have.length', 0);
  });

  it('conserva el carrito ante HTTP 500 y permite reintentar contra la API real', () => {
    const errorMessage = 'Fallo temporal de la API. Intenta de nuevo.';
    cy.get('button[aria-label="Agregar Capuchino"]').click();
    cy.get('button[aria-label="Aumentar Capuchino"]').click();
    cy.get('input[aria-label="Cantidad de Capuchino"]').should('have.value', '2');
    cy.get('[data-cy="cart-total"]').should('have.text', 'Q44.00');

    // Solo el primer POST se simula; el siguiente usa la API real.
    cy.intercept({ method: 'POST', pathname: '/api/orders', times: 1 }, {
      statusCode: 500,
      body: { error: errorMessage },
    }).as('failedOrder');
    cy.contains('button', /^Confirmar pedido$/).click();
    cy.wait('@failedOrder').then(({ request, response }) => {
      expect(request.body).to.deep.equal({ items: [{ productId: 2, quantity: 2 }] });
      expect(response?.statusCode).to.equal(500);
      expect(response?.body).to.deep.equal({ error: errorMessage });
    });

    cy.get('[role="alert"]').should('be.visible').and('contain.text', errorMessage)
      .and('contain.text', 'Tu carrito se conserva; puedes reintentar.');
    cy.get('aside[aria-labelledby="cart-title"]').should('be.visible')
      .within(() => {
        cy.contains('h3', 'Capuchino').should('be.visible');
        cy.get('input[aria-label="Cantidad de Capuchino"]').should('have.value', '2');
        cy.get('[data-cy="cart-count"]').should('have.text', '2');
        cy.get('[data-cy="cart-total"]').should('have.text', 'Q44.00');
      });
    cy.request({
      url: 'http://localhost:3000/api/orders/1',
      failOnStatusCode: false,
    }).its('status').should('equal', 404);

    cy.contains('button', /^Reintentar pedido$/).should('be.enabled').click();
    cy.wait('@createOrder').then(({ request, response }) => {
      expect(request.body).to.deep.equal({ items: [{ productId: 2, quantity: 2 }] });
      expect(response?.statusCode).to.equal(201);
      expect(response?.body).to.deep.equal({ id: 1, total: 44 });
    });
    cy.get('[data-cy="order-success"]').should('be.visible')
      .and('contain.text', '¡Pedido confirmado!');
    cy.get('[data-cy="order-id"]').should('be.visible').and('have.text', '#1');
    cy.get('[data-cy="order-total"]').should('have.text', 'Q44.00');
    cy.get('[role="alert"]').should('not.exist');
    cy.request('http://localhost:3000/api/orders/1').then(({ status, body }) => {
      expect(status).to.equal(200);
      expect(body.total).to.equal(44);
      expect(body.items).to.deep.equal([
        { productId: 2, name: 'Capuchino', quantity: 2, unitPrice: 22, subtotal: 44 },
      ]);
    });
  });
});
