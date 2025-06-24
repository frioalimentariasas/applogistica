'use server';

/**
 * @fileOverview AI-powered product suggestion flow.
 *
 * - suggestProducts - A function that suggests products based on a description.
 * - SuggestProductsInput - The input type for the suggestProducts function.
 * - SuggestProductsOutput - The return type for the suggestProducts function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestProductsInputSchema = z.object({
  description: z.string().describe('The product description to generate suggestions for.'),
  existingProducts: z.array(z.string()).describe('The list of existing products in the inventory.'),
});

export type SuggestProductsInput = z.infer<typeof SuggestProductsInputSchema>;

const SuggestProductsOutputSchema = z.array(z.string()).describe('A list of suggested products.');

export type SuggestProductsOutput = z.infer<typeof SuggestProductsOutputSchema>;

export async function suggestProducts(input: SuggestProductsInput): Promise<SuggestProductsOutput> {
  return suggestProductsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestProductsPrompt',
  input: {schema: SuggestProductsInputSchema},
  output: {schema: SuggestProductsOutputSchema},
  prompt: `You are an AI assistant that suggests products based on a description.

Given the following description: {{{description}}}
and the following existing products: {{#each existingProducts}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

Suggest a list of products that match the description.  Return ONLY the list of product suggestions.
`, 
});

const suggestProductsFlow = ai.defineFlow(
  {
    name: 'suggestProductsFlow',
    inputSchema: SuggestProductsInputSchema,
    outputSchema: SuggestProductsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
