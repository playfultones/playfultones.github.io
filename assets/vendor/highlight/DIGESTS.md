## Subresource Integrity

If you are loading Highlight.js via CDN you may wish to use [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) to guarantee that you are using a legimitate build of the library.

To do this you simply need to add the `integrity` attribute for each JavaScript file you download via CDN. These digests are used by the browser to confirm the files downloaded have not been modified.

```html
<script
  src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"
  integrity="sha384-5xdYoZ0Lt6Jw8GFfRP91J0jaOVUq7DGI1J5wIyNi0D+eHVdfUwHR4gW6kPsw489E"></script>
<!-- including any other grammars you might need to load -->
<script
  src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/go.min.js"
  integrity="sha384-HdearVH8cyfzwBIQOjL/6dSEmZxQ5rJRezN7spps8E7iu+R6utS8c2ab0AgBNFfH"></script>
```

The full list of digests for every file can be found below.

### Digests

```
sha384-gRTR/fmk+6+ygbihH/fJvHgmffnOrd/eO7DW5zgu1uN9GBohtDx+OBs0DI0ejigB /es/languages/bash.js
sha384-Pg7b9hYE6kefjcNqAabhv8jOLCVoZubUaM4bZFjUJd0CaaQ14ksDI0GVllMtAF4S /es/languages/bash.min.js
sha384-xhohaHGp8S443Qn4JZUYAcKqIIl0bQkFA79EUxpbX8GWb5oufdvvSI9ipl/Dasev /es/languages/c.js
sha384-xaTVEdq02jgKStoYDcZD8NhTN1XV/TWpIu4OM53MtMiLl08+e9YJNENo+R/6Nwp0 /es/languages/c.min.js
sha384-4Jkc+l0njgG1ekq/E7kJCYXltFaDopM/LQLUyoCpBGa7oWSdgQzWPXqFxZWXsyRI /es/languages/cmake.js
sha384-7HLwuzaDtJxWvaGQ7qGwWFgozJH1ljKCOPmIVeVosrCZ8RpzoA1wEF/6RSqDKyeP /es/languages/cmake.min.js
sha384-rFCBWxbZHxZD51qKR2cdayIcKUSHS3p1PWPIs1kjgsP7lu9ZP32ah/2DoQUm/rTg /es/languages/cpp.js
sha384-+1Koxl0St78gEZW5CpFK+dbLp7yNsfwLzzQUsSGimV4k/RVJUz6YvqtsqtdbJyKf /es/languages/cpp.min.js
sha384-0s8f7nphuRu8IIkFNCeOVZhvbjt7YKZEHl38OjfkCkdtnwIUvwRNbxxUHkCdcYjm /es/languages/csharp.js
sha384-xLfGW0hIBHie9xNFuVroNihI0BdEO8FKxOeCdyJBrO1eM7s5BsQ8F3fLtFydQZ+Z /es/languages/csharp.min.js
sha384-CxgzMCYCdPS3oPSgukCqpDiqHKDKcrLdlyMqy9UF73u63+XVRlI32OproboitNa6 /es/languages/diff.js
sha384-joI34L4jMJOgkz6zOb3sqraHH5tmocRfXvs9HkdHfUpD3ceSxAqKlubpBT/4Q/sV /es/languages/diff.min.js
sha384-vZWLk+C+23/W/GAmv4PXkZSZo82LXul6DdSgWcMzutPxGltitIk38HyLrxRVsFvm /es/languages/ini.js
sha384-CVynu7LzwkkAUiajSi0jprssYhgg9Vi1WSd8iR84Vmi6JdRGq3DT4vvEfjzoxxOK /es/languages/ini.min.js
sha384-lk+aAr+DNq8Rz3hXPSZ7ga38GS+tQfXDvexuUnyDCSju1t1SAsLipVIFGlRtcUjE /es/languages/java.js
sha384-5GpB6kfA2w03pZhAUmmNSYvR5pLvne/Rzqc22BmHv+t9ES7ifMX/ZE7x5TBeqW4d /es/languages/java.min.js
sha384-g7t9fKR5Tvod4iWv7BQXN+/JMn5GT9sD6FG3h7Fgl+KCv5k4NnnCzEqUe7BMJ9Mv /es/languages/javascript.js
sha384-f7huPivS1dV2T5V+g0aJpgsY7WBHWCsioIq30tpNoXGizD65fWJYGuXXVPNI52VB /es/languages/javascript.min.js
sha384-8CRS96Xb/ZkZlQU+5ffA03XTN6/xY40QAnsXKB0Y+ow1vza1LAkRNPSrZqGSNo53 /es/languages/json.js
sha384-UHzaYxI/rAo84TEK3WlG15gVfPk49XKax76Ccn9qPWYbUxePCEHxjGkV+xp9HcS/ /es/languages/json.min.js
sha384-gXOyhc1mLm8alPswShRUsxnBadQf2AOcdpmFVqkKSZBNS07kTOHb3DDepD3Rf9eH /es/languages/makefile.js
sha384-iagI2W32nmVJq2EVd59zlgz2bFjR/MC0JRsbcFaeZL2gmvHzzOeyRTpTKGBSKd7q /es/languages/makefile.min.js
sha384-+KkqXkoHKtuOmUzhZ0BjyV0qjljnS+z6i4fELMEg5brFPtmDIog4zZMhylaBTsVi /es/languages/markdown.js
sha384-E7UvgBH6skA1FIOcn3B2c68GtJzrmZlOOC5p/fsxwihTZG/bBedJZu5PC1+kGX7q /es/languages/markdown.min.js
sha384-i6sPjmXfHWLljAXTYYk0vBOwgsUnUKnKXKH41qzc9OMhaf5AFZqXH7azX4SYdUiR /es/languages/plaintext.js
sha384-OOrQLW97d+/1orj9gjftwbbQyV8LNAcgagqVKBhUYA08Hdi5w0p6VoB3yt2k7gnG /es/languages/plaintext.min.js
sha384-Cmq5lORXzyHraasLNqmfchH07JRXyEmjDF+j6tSggoXjYHwtgX/ySW6kkRytM5uu /es/languages/python.js
sha384-ZV5sgX70bBgLkDR5Mtox5UsbJedBc39hRKPdvTw6miK4lSkE/wv94cLY2iyZb/sB /es/languages/python.min.js
sha384-1mmBZmAs44b6FtD9wpMiLJa8bLZgZv9xoAhngN6B5Q22y9CtcsU2lat0zlRtyVgy /es/languages/shell.js
sha384-u9PV7oWG/lZlm+GnftX7kn0w4b8rRfFxSv5SmJJPHWKGI03rz6VLqgZdQ1B5ez6b /es/languages/shell.min.js
sha384-9ECFzM+oWDye4s/MFx3QUXGo4mW43+SyLpWUDeQtWup6GZJ+KHFxVS89PmZt/fzl /es/languages/xml.js
sha384-PQrsaWeWrBiE1CFRw8K335CaJuQRTjDGm73vn8bXvlwaw6RyqWObdvMTBS8B75NN /es/languages/xml.min.js
sha384-7HTgKp/l2rzlyrh5vUfbfZVy+Wx1lKO4iGmfqvakienApv21u55lo+Vi+iVg4jY0 /es/languages/yaml.js
sha384-4smueUtgWTorlNLbaQIawnVCcIAuw82NetPOGWN5PbZT/pMr0rjvZXj0EUzJV1nr /es/languages/yaml.min.js
sha384-Jrkpn2hK0TY04skYBXB9fj7mMpKYy7g726cPwXGXf6mdBXnFlTDXFduxikMCRXT7 /languages/bash.js
sha384-BbT8tZtvkh8HPXIvL5RtzuljBwI3gR5KIdYxZyYSyI5C/+KNAGdzAiexvmxuroag /languages/bash.min.js
sha384-lAz0Eyld5DmFJB7cxaZonrkUJzGefh+K3niV5d7+vzzS7/P7FEeCJeLNXzMjeo+N /languages/c.js
sha384-tMmX0hBMZeMrZhX6dUNxA94/DNJLl70ao6qu2N9+b/6Ep9Y2e1pBzVjxtLygIB+d /languages/c.min.js
sha384-tz8sDBcGyDfVGZQ9FUAKB4eJnNPu9yXGT0lMmnjqQR8IK9WLxlGFllFwPSZUAoH/ /languages/cmake.js
sha384-PInWnmju5g7EmUG5eiPVUat7Psw4dFOQZCNdSV5R/HgXYI+6efBY9fTv+Ye9+kwq /languages/cmake.min.js
sha384-Z5Ja/rxBluJ4iPYwJYn2numfw2XFmlp3qLL1aJ1SZqyTjKWwMh9yWfpNCOqf3vAm /languages/cpp.js
sha384-B711MHXDqRvH/pKkxJk84RyRt9g0qyAJFsu2XukZKoCdnEiBmA6Aq9fO23ZCS7qk /languages/cpp.min.js
sha384-NTF0oluJbKDCxwGTujk+IsRQRbf+waUyDilA5GhOA+VSoxhyApQpmDWMjxfFO3dt /languages/csharp.js
sha384-Z+o7SU/ldIEIdOIqpMV+9s2n8EE1rZTFSRv5Sd7rlaSoPTpyflmmZ/oRb6ycw/2s /languages/csharp.min.js
sha384-UZBiDq19/Pu+BEZTOdnKdnew0sCWKFa2EmtRr9O+ZndYF1NgJOlya5bua3Wf++BW /languages/diff.js
sha384-04MxX6iQ0WrwX6Df4GJWGCXwfr5hVS5CQ0r9CS7aunho7Fkj/AAWbEPU8a6G+4LA /languages/diff.min.js
sha384-izwcylRNWmKKRcyCyrYZyNQekUCyR7Fh1x8nYWNCRJoRDU5JXv6TcqlP4C+4MfIf /languages/ini.js
sha384-NrmnsdarwteQHPGjt70kaQTi1KE0XfOJNX9/VJSg6wWwU6U2nPzjl3iWkgU1cvyx /languages/ini.min.js
sha384-Dprg6CdFFkimxaHg7qM7njVaWLMlOLqughixPERBDbm0cHdX6rKujTnJReof8O6m /languages/java.js
sha384-e+59xEZvRMXSRGD31B3HOBGAGqhhs+bbkxCqPuJDkSX5QGneIGTIfwdYJckTN3AO /languages/java.min.js
sha384-yxv7Fv9ToggiLsR67t98hV5ZRup6XX6xL1Rkbi/cGV5J8y7fosCi9POqlBkiBWFg /languages/javascript.js
sha384-tPOrIubtDHoQU7Rqw0o88ilthGO0/4xEZGB47XrQKWhrc1/SchwsDx+AP74u4nk0 /languages/javascript.min.js
sha384-pUlqdjoNePvHvdi7GVKJJnh/P2T3EvXXodl5j0JtTkbNC4DRH7gwGbcHFa84bFOP /languages/json.js
sha384-3C+cPClJZgjKFYAb0bh35D7im2jasLzgk9eRix3t1c5pk1+x6b+bHghWcdrKwIo3 /languages/json.min.js
sha384-NpIMNHXY0x67yhJSnXiHh9V28uT0Bfz2cKxc30p9vURMu5IAcDhJT1TpaqUE1x0B /languages/makefile.js
sha384-DjL90zP08vzabGXs0CglFocqoxPXnzAcKhobGV+CQDA5FHGW7xCnxjylOhna+HB+ /languages/makefile.min.js
sha384-Sk9XW/OOutdl6KS1M9Wson0imuqr0LkpoTRDHi5QFH4MWe0aViI5d86BOVkh8Ds0 /languages/markdown.js
sha384-Rv26WbhHH4MDPzeExq4ECmZUYF942tlfVhqA91Drw1P+Ey55KjihLF9RJENxjWr1 /languages/markdown.min.js
sha384-MZKv9uidO1+VnHz8xWxPv6ACuLO5t823eanvTcKYnmi/ocdVYD8zKZNTxmF0nKEM /languages/plaintext.js
sha384-Z9EdtPaC8UiXHEq1WuQTdvqT+FwjLwaVTIwTCZW/dGfiU9nbF8Shvltrhqtw83Qb /languages/plaintext.min.js
sha384-ueSSFZFqg7cVD0dpEqIk9EefJiJUYan0PH6I8u/p+bNLLx7dMs4J2keMaFXqCN8P /languages/python.js
sha384-eXRt+aAa2ig1yFVDQCLis8k9s/1dikTcigj+/R07yNdIxc8BAG/b1uHDyEW3of17 /languages/python.min.js
sha384-BanM6jNzM3hgNw0Vu3gSe58a3MK3PSlMUzh5s8QaaDzIvTWgB0jNetV3rNxteKHy /languages/shell.js
sha384-mSZF08WaP0Llc4GMwE0KA2V9yfZQimO5PvfcXf2AATDdqri3Q7IdV7pfbhVPJCHV /languages/shell.min.js
sha384-Pgzg6a405W6U1xFjjSs5i8d7V81Tmt/TYn8HFOa+u1psDc8cbs8nC7BuyNXbWWRK /languages/xml.js
sha384-FQjSArDMJE4WMAJGcCNAV+IXIOljcIxM3UFAD2vxjedWmBnnDaAyqRG7AQHf/uM/ /languages/xml.min.js
sha384-6GXi9L5BnOWPU6bzwYL78Zscp23qyDdMLZpZvp4mLzvF2qt0eY/DfsPHiFVXq4hv /languages/yaml.js
sha384-A/iMReLA0Bo3tLydBIoOQXQzYnrwL90jkHYUubrtERUGCbIuU7U0EHge0Xd2s5sr /languages/yaml.min.js
sha384-4z5fs48LHw9ch419Ud+F7afqTIWd2I6v79sf3iftaG0nHMr4jFSBJHyDkJJn12wR /highlight.js
sha384-3cuUZP8slB78Y/eFtRg30ttLX4tWSPsJvVmY1KA3d6UO/K4aNER07U73vMQhEyBl /highlight.min.js
```

