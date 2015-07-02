function hashset(a) {
    // no querysting
    if (a == "") {
        console.error("missing querysting");
        return {};
    }

    pairs = a.split('&');
    b = {}
    for (var i = 0; i < pairs.length; i++) {
        pair = pairs[i].split('=', 2);
        if (pair.length == 1)
            b[pair[0]] = "";
        else
            b[pair[0]] = pair[1];
    }
    return b;
}
