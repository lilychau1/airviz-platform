exports.handler = async (event) => {
  console.log("Ingest event received:", JSON.stringify(event, null, 2));

  // Your logic here. For example, returning a success message with event data.
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Data ingested!",
      input: event,
    }),
  };
};
