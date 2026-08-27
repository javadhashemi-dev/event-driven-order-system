import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOrderDto } from '../../src/modules/order/dto/create-order.dto.js';

async function validateDto(dto: unknown) {
  return validate(plainToInstance(CreateOrderDto, dto as object));
}

describe('CreateOrderDto (validation)', () => {
  const valid = {
    customerId: 'cust_1',
    items: [{ productId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: 2 }],
  };

  it('should pass for a well-formed order', async () => {
    const errors = await validateDto(valid);
    expect(errors).toHaveLength(0);
  });

  it('should fail when customerId is missing', async () => {
    const errors = await validateDto({ ...valid, customerId: '' });
    expect(errors.some((e) => e.property === 'customerId')).toBe(true);
  });

  it('should fail when items array is empty', async () => {
    const errors = await validateDto({ ...valid, items: [] });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('should fail when productId is not a UUID', async () => {
    const errors = await validateDto({
      ...valid,
      items: [{ productId: 'not-a-uuid', quantity: 1 }],
    });
    expect(
      errors.some((e) => e.property === 'items' && e.children?.length === 1),
    ).toBe(true);
  });

  it('should fail when quantity is less than 1', async () => {
    const errors = await validateDto({
      ...valid,
      items: [
        { productId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: 0 },
      ],
    });
    expect(
      errors.some((e) => e.property === 'items' && e.children?.length === 1),
    ).toBe(true);
  });
});
