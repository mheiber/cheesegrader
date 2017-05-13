'use strict'

const fetch = require('isomorphic-fetch')
const express = require('express')
const bodyParser = require('body-parser')
const { JSDOM } = require('jsdom')

const URI = process.env.SHEET_URI
const PORT = process.env.PORT
const REFRESH_DOCUMENT_INTERVAL = 60 * 1000

if (!URI || !PORT) {
    console.error('expected SHEET_URI and PORT environment variables to be defined')
    process.exit(1)
}

// swap the next two lines in order to read canned data from a file instead of hitting Google
// const getBodyText = () => Promise.resolve(require('fs').readFileSync('./dummy.html', 'utf8'))
const getBodyText = uri => fetch(uri).then(res => res.text())

const getDocument = uri => getBodyText(uri).then(bodyText => new JSDOM(bodyText).window.document)

const trToStringArr = tr => [].reduce.call(tr.children, (arr, td) => td.textContent ? arr.concat(td.textContent) : arr, [])

const getHeader = document => trToStringArr(document.querySelector('tbody').children[0])

const getRowOrNull = (document, {id, surname}) => {

    const trs = document.querySelector('tbody').children
    const matchingTr = [].find.call(trs, tr => 
                                        tr.children.length >= 4
                                        && tr.children[2].textContent.trim() === '' + id
                                        && tr.children[3].textContent.trim().split(',')[0].toLowerCase() === surname.toLowerCase()
                        )
    return matchingTr
            ? trToStringArr(matchingTr)
            : null
}

const globalState = {
    document: null
}

const refreshDocument = uri =>
    getDocument(uri)
    .then(document => globalState.document = document)
    .catch(console.error)

const app = express()
                .use(bodyParser.urlencoded({extended: false}))

const stringArrayToTrHtml = arr => '<tr>' + arr.map(datum => `<td>${datum}</td>`).join('') + '</tr>'

const render = ({header, row}) => `
    <head>
        <style>
            td {
                
                border: 1px solid black
            }
        </style>
    </head>
    <table>
        ${stringArrayToTrHtml(header.slice(1))}
        ${stringArrayToTrHtml(row.slice(1))}
    </table>
    <script>setTimeout(() => window.location.reload(), 60 * 1000)</script>
`.trim()

const renderIndex = () => `

    <form method="POST">
        <label>Surname<input name="surname" placeholder="Surname"></input></label>
        <label>Uid<input name="id" placeholder="uid"></input></label>
        <input type="submit" value="submit"></input>
    </form>

`

app.post('/records', (req, res) => {
    console.log(req.body)
    const { id, surname } = req.body

    try {

        const rowDataOrNull = getRowOrNull(globalState.document, {id, surname});
        if (!rowDataOrNull) {
            console.error('not found')
            res.status(400).send(`not found <a href="/records">try again</a>`)
        }
        else {
            console.log('found')
            const row = rowDataOrNull
            const html = render({
                header: getHeader(globalState.document),
                row
            })
            res.send(html)
        }
    }
    catch(err) {
        console.error(err)
        res.status(500).send('sorry! something went wrong')
    }

})

app.get('/records', (req, res) => {
    res.status(200).send(renderIndex())
})


refreshDocument(URI).then(() => {

    setInterval(refreshDocument.bind(null, URI), REFRESH_DOCUMENT_INTERVAL)

    app.listen(PORT, () => {
        console.log(`listening on port ${PORT}`)
    })
})
