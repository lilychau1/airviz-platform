<script lang="ts">
  import { submitForm } from '../api/MockApi'; 

  let name = '';
  let email = '';
  let message = '';
  let success = false;
  let error = '';

  async function handleSubmit(event: Event) {
    event.preventDefault(); 

    try {
      await submitForm(name, email, message);
      success = true;
      error = '';
    } catch (e) {
      error = 'Failed to submit the form. Please try again.';
      success = false;
    }
  }
</script>

<main>
    <h1>Contact Us</h1>
    <form on:submit|preventDefault={handleSubmit}>
    <label for="name">Name</label>
    <input id="name" type="text" bind:value={name} required />

    <label for="email">Email</label>
    <input id="email" type="email" bind:value={email} required />

    <label for="message">Message</label>
    <textarea id="message" bind:value={message} required></textarea>

    <button type="submit">Send</button>
    </form>

    {#if success}
        <p>Your message has been sent. Thank you!</p>
    {:else if error}
        <p style="color:red">{error}</p>
    {/if}
</main>
