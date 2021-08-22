export const usePromise = () => {
  let fail
  let succeed
  const promise = new Promise((resolve, reject) => [succeed, fail] = [resolve, reject])
  return [promise, succeed, fail]
}

export const resultOf = async (promise) => promise
  .then(data => [ null, data ])
  .catch(error => [ error, null ])