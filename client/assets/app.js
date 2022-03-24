let buyMode = true;
let token = undefined;
let web3, user, dexInst, tokenInst;
let priceData;
let finalInput, finalOutput;

// GanacheのCONTRACTからコントラクトアドレスを取得して代入
const linkAddr = "0xBff5C681447B2B34f4184C1c919B508d314aC877";
const daiAddr = "0xd56E493464DdB59Ff8Ca09F42C2Cb0b0D73fD52E";
const compAddr = "0x6f2aF0669726c4Bb1623469B88ADfbac3DdF6d5a";
const dexAddr = "0x3c6889E7024f1Eda10b731f2EB621f55456CcF7D";

$(document).on("click", ".dropdown-menu li a", function () {
  let element = $(this);
  let img = element[0].firstElementChild.outerHTML;
  let text = $(this).text();

  // スペースを削除する
  token = text.replace(/\s/g, "");
  if (user) {
    switch (token) {
      case "DAI":
        tokenInst = new web3.eth.Contract(abi.token, daiAddr, { from: user });
        break;
      case "LINK":
        tokenInst = new web3.eth.Contract(abi.token, linkAddr, { from: user });
        break;
      case "COMP":
        tokenInst = new web3.eth.Contract(abi.token, compAddr, { from: user });
        break;
    }
  }
  $(".input-group .btn").html(img + text);
  $(".input-group .btn").css("color", "#fff");
  $(".input-group .btn").css("font-size", "large");
});

$(document).ready(async () => {
  // Metamaskがある場合
  if (window.ethereum) {
    // Metamaskのノードへ接続
    web3 = new Web3(Web3.givenProvider);
  }
  priceData = await getPrice();

  // 綺麗にオブジェクトを表示してくれる
  console.dir(priceData);
});

// MetamaskへのConnectボタンをクリック
$(".btn.login").click(async () => {
  try {
    // Metamaskのオブジェクトにリクエストする（接続して良いか確認）
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    // userにアカウントアドレスをいれる
    user = accounts[0];
    dexInst = new web3.eth.Contract(abi.dex, dexAddr, { from: user });
    // 画面へアカウント名などを取得
    $(".btn.login").html("Connected");
    $(".btn.swap").html("Enter an amount");
    $("#username").html(user);
  } catch (error) {
    alert(error.message);
  }
});

$("#swap-box").submit(async (e) => {
  e.preventDefault();

  try {
    buyMode ? await buyToken() : await sellToken();
  } catch (err) {
    alert(err.message);
  }
});

$("#arrow-box h2").click(() => {
  if (buyMode) {
    buyMode = false;
    sellTokenDisplay();
  } else {
    buyMode = true;
    buyTokenDisplay();
  }
});

$("#input").on("input", async function () {
  // 数量に入力がなかったら処理終了
  if (token === undefined) {
    return;
  }
  // 数量に入力があったら小数点ありの数値に直す
  const input = parseFloat($(this).val());
  // 金額を取得して入れる
  await updateOutput(input);
});

// Coingeckoから値段を取得する（json形式に直す）
async function getPrice() {
  const daiData = await (
    await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=dai&vs_currencies=eth"
    )
  ).json();

  const compData = await (
    await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=compound-governance-token&vs_currencies=eth"
    )
  ).json();

  const linkData = await (
    await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=chainlink&vs_currencies=eth"
    )
  ).json();

  return {
    // 複数返したい場合はこのようにオブジェクト形式で返す
    // eth部分のみを返す {"dai":{"eth":0.00036722}}
    daiEth: daiData.dai.eth,
    linkEth: linkData.chainlink.eth,
    // -が使えない場合はこのように書く
    compEth: compData["compound-governance-token"].eth,
  };
}

// 処理内でawaitを使っていたらfunctionにasyncを付ける
async function updateOutput(input) {
  let output;
  switch (token) {
    case "COMP":
      // buyModeの場合：input / priceData.compEth　sellModeの場合：input * priceData.compEth
      output = buyMode ? input / priceData.compEth : input * priceData.compEth;
      break;
    case "LINK":
      output = buyMode ? input / priceData.linkEth : input * priceData.linkEth;
      break;
    case "DAI":
      output = buyMode ? input / priceData.daiEth : input * priceData.daiEth;
      break;
  }
  // 1DAI or COMP or LINK = 1ETHの計算
  const exchangeRate = output / input;
  // 入力中の変換を弾く
  if (output === 0 || isNaN(output)) {
    $("#output").val("");
    $(".rate.value").css("display", "none");
    $(".btn.swap").html("Enter an amount");
    $(".btn.swap").addClass("disabled");
  } else {
    // 7桁分まで表示
    $("#output").val(output.toFixed(7));
    $(".rate.value").css("display", "block");
    if (buyMode) {
      $("#top-text").html("ETH");
      $("#bottom-text").html(" " + token);
      $("#rate-value").html(exchangeRate.toFixed(5));
    } else {
      $("#top-text").html(token);
      $("#bottom-text").html(" ETH");
      $("#rate-value").html(exchangeRate.toFixed(5));
    }
    await checkBalance(input);

    // wei表記に直す
    finalInput = web3.utils.toWei(input.toString(), "ether");
    finalOutput = web3.utils.toWei(output.toString(), "ether");
  }
}

async function checkBalance(input) {
  const balanceRaw = buyMode
    // buyModeだったら残高をチェック
    ? await web3.eth.getBalance(user)
    // sellModeだったらDAIやCOMP、LINKの数量をチェック
    : await tokenInst.methods.balanceOf(user).call();
  // string型をfloat型に変更
  const balance = parseFloat(web3.utils.fromWei(balanceRaw, "ether"));

  // 残高や持っている数量よりも入力した値が小さい場合はボタンが押せる
  if (balance >= input) {
    $(".btn.swap").removeClass("disabled");
    $(".btn.swap").html("Swap");
  } else {
    $(".btn.swap").addClass("disabled");
    // 不足している場合の表示
    $(".btn.swap").html(`Insufficient ${buyMode ? "ETH" : token} balance`);
  }
}

// tokenを買う
function buyToken() {
  const tokenAddr = tokenInst._address;
  // Promiseは非同期処理の操作が完了したときに結果を返す
  // 全て終わってからでないと処理してはいけないから
  // resolve成功したとき　reject失敗したとき
  return new Promise((resolve, reject) => {
    dexInst.methods
      .buyToken(tokenAddr, finalInput, finalOutput)
      .send({ value: finalInput })
      // .sendが終わったら
      .then((receipt) => {
        console.log(receipt);
        const eventData = receipt.events.buy.returnValues;
        const amountDisplay = parseFloat(
          web3.utils.fromWei(eventData._amount, "ether")
        );
        const costDisplay = parseFloat(
          web3.utils.fromWei(eventData._cost, "ether")
        );
        const tokenAddr = eventData._tokenAddr;
        alert(`
          Swap successful! \n
          Token address: ${tokenAddr} \n
          Amount: ${amountDisplay.toFixed(7)} ${token} \n
          Cost: ${costDisplay.toFixed(7)} ETH
        `);
        resolve();
      })
      // 失敗したとき
      .catch((err) => reject(err));
  });
}

// tokenを売る
async function sellToken() {
  // .callで値を取得（viewやpureの場合にcall()を使用、逆に更新等の場合はsend()を使う）
  // contracts/ERC20.sol内の下記を実行
  // function allowance(address _owner, address _spender) public view returns (uint256){
  const allowance = await tokenInst.methods.allowance(user, dexAddr).call();
  if (parseInt(finalInput) > parseInt(allowance)) {
    try {
      await tokenInst.methods.approve(dexAddr, finalInput).send();
    } catch (err) {
      // rejectとほぼ同じ処理
      throw err;
    }
  }

  // 許可を与えた後
  try {
    const tokenAddr = tokenInst._address;
    const sellTx = await dexInst.methods
      .sellToken(tokenAddr, finalInput, finalOutput)
      .send();
    console.log(sellTx);
    const eventData = sellTx.events.sell.returnValues;
    const amountDisplay = parseFloat(
      web3.utils.fromWei(eventData._amount, "ether")
    );
    const costDisplay = parseFloat(web3.utils.fromWei(eventData._cost, "ether"));
    const _tokenAddr = eventData._tokenAddr;
    // toFixedは小数点第7位で整形する
    alert(`
        Swap successful!\n
        Token Address: ${_tokenAddr} \n
        Amount: ${amountDisplay.toFixed(7)} ETH\n
        Price: ${costDisplay.toFixed(7)} ${token}
      `);
  } catch (err) {
    throw err;
  }
}
